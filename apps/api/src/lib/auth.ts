import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { genericOAuth } from "better-auth/plugins";
import { getDb, authProviderConfig, eq } from "@groombook/db";
import { decryptSecret } from "@groombook/db";

const BETTER_AUTH_SECRET = process.env.BETTER_AUTH_SECRET;
const BETTER_AUTH_URL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

// Auth instance — initialized lazily via initAuth()
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let authInstance: any = null;
let authInitPromise: Promise<void> | null = null;

/** Returns the current auth instance. Throws if not yet initialized. */
export function getAuth() {
  if (!authInstance) {
    throw new Error(
      "Auth not initialized. Call initAuth() at startup before handling requests."
    );
  }
  return authInstance;
}

/** Returns a promise that resolves when auth is initialized. */
export function getAuthPromise() {
  return authInitPromise;
}

/** Returns which OAuth/social providers are configured via env vars. */
export function getActiveProviders(): string[] {
  const providers: string[] = [];
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    providers.push("google");
  }
  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    providers.push("github");
  }
  if (process.env.OIDC_ISSUER && process.env.OIDC_CLIENT_ID && process.env.OIDC_CLIENT_SECRET) {
    providers.push("authentik");
  }
  return providers;
}

/**
 * Re-initializes the Better-Auth instance after auth config changes.
 *
 * Clears both authInstance and authInitPromise, then calls initAuth() to
 * re-read config from DB and build a fresh Better-Auth instance.
 * Sessions are DB-backed and survive the re-init.
 */
export async function reinitAuth(): Promise<void> {
  authInstance = null;
  authInitPromise = null;
  await initAuth();
  console.log("[auth] Re-initialized auth instance after config change");
}

/**
 * Initializes the Better-Auth instance.
 *
 * Config resolution chain:
 * 1. Query auth_provider_config table for an enabled provider
 * 2. If DB config exists → use it (decrypt clientSecret)
 * 3. If no DB config → fall back to OIDC_* env vars
 * 4. If neither → auth is unconfigured (getAuth() returns null, AUTH_DISABLED implied)
 *
 * Idempotent — subsequent calls return immediately after initialization completes.
 */
export async function initAuth(): Promise<void> {
  if (authInstance) return; // Already initialized
  if (authInitPromise) {
    await authInitPromise;
    return;
  }

  authInitPromise = (async () => {
    // Guard: require BETTER_AUTH_SECRET unless explicitly in dev/demo mode
    if (!BETTER_AUTH_SECRET && process.env.AUTH_DISABLED !== "true") {
      throw new Error(
        "[FATAL] BETTER_AUTH_SECRET environment variable is required when auth is enabled"
      );
    }

    // AUTH_DISABLED=true means dev/demo mode — still build Better-Auth with placeholder
    // config so auth.handler exists (middleware bypasses it anyway)
    if (process.env.AUTH_DISABLED === "true") {
      console.warn("[auth] AUTH_DISABLED=true — building placeholder auth instance");
      authInstance = betterAuth({
        database: drizzleAdapter(getDb(), { provider: "pg" }),
        secret: BETTER_AUTH_SECRET ?? "placeholder-secret-do-not-use-in-prod",
        baseURL: BETTER_AUTH_URL,
        plugins: [
          genericOAuth({
            config: [
              {
                providerId: "authentik",
                clientId: "placeholder",
                clientSecret: "placeholder",
                discoveryUrl: undefined,
                scopes: ["openid", "profile", "email"],
              },
            ],
          }),
        ],
        session: {
          expiresIn: 60 * 60 * 24 * 7,
          updateAge: 60 * 60 * 24,
          cookieCache: { enabled: false },
        },
        trustedOrigins: [process.env.CORS_ORIGIN ?? "http://localhost:5173"],
      });
      return;
    }

    // Step 1: Try to load config from DB
    const db = getDb();
    const [dbConfig] = await db
      .select()
      .from(authProviderConfig)
      .where(eq(authProviderConfig.enabled, true))
      .limit(1);

    let providerConfig: {
      providerId: string;
      clientId: string;
      clientSecret: string;
      issuerUrl: string;
      internalBaseUrl?: string;
      scopes: string;
    };

    if (dbConfig) {
      // Step 2: Use DB config (decrypt clientSecret)
      const decryptedSecret = decryptSecret(dbConfig.clientSecret);
      providerConfig = {
        providerId: dbConfig.providerId,
        clientId: dbConfig.clientId,
        clientSecret: decryptedSecret,
        issuerUrl: dbConfig.issuerUrl,
        internalBaseUrl: dbConfig.internalBaseUrl ?? undefined,
        scopes: dbConfig.scopes,
      };
      console.log("[auth] Using DB config for provider:", dbConfig.providerId);
    } else {
      // Step 3: Fall back to env vars
      const oidcIssuer = process.env.OIDC_ISSUER;
      const oidcClientId = process.env.OIDC_CLIENT_ID;
      const oidcClientSecret = process.env.OIDC_CLIENT_SECRET;

      if (!oidcIssuer || !oidcClientId || !oidcClientSecret) {
        // Step 4: Neither DB config nor env vars — auth is unconfigured
        console.warn(
          "[auth] No auth provider configured. Set up auth_provider_config in DB or OIDC_* env vars."
        );
        return; // authInstance stays null — AUTH_DISABLED mode
      }

      providerConfig = {
        providerId: "authentik",
        clientId: oidcClientId,
        clientSecret: oidcClientSecret,
        issuerUrl: oidcIssuer,
        internalBaseUrl: process.env.OIDC_INTERNAL_BASE,
        scopes: "openid profile email",
      };
      console.log("[auth] Using env var config (no DB config found)");
    }

    const hasGoogle = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
    const hasGitHub = !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);

    const callbackBase = `${BETTER_AUTH_URL}/api/auth/callback`;

    // Build Better-Auth instance using resolved config
    authInstance = betterAuth({
      database: drizzleAdapter(db, {
        provider: "pg",
      }),
      secret: BETTER_AUTH_SECRET,
      baseURL: BETTER_AUTH_URL,
      socialProviders: {
        ...(hasGoogle ? {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
            redirectURI: `${callbackBase}/google`,
          },
        } : {}),
        ...(hasGitHub ? {
          github: {
            clientId: process.env.GITHUB_CLIENT_ID!,
            clientSecret: process.env.GITHUB_CLIENT_SECRET!,
            redirectURI: `${callbackBase}/github`,
          },
        } : {}),
      },
      plugins: [
        genericOAuth({
          config: [
            {
              providerId: providerConfig.providerId,
              clientId: providerConfig.clientId,
              clientSecret: providerConfig.clientSecret,
              ...(providerConfig.internalBaseUrl
                ? {
                    authorizationUrl: `${new URL(providerConfig.issuerUrl).origin}/application/o/authorize/`,
                    tokenUrl: `${providerConfig.internalBaseUrl}/application/o/token/`,
                    userInfoUrl: `${providerConfig.internalBaseUrl}/application/o/userinfo/`,
                  }
                : {
                    discoveryUrl: `${providerConfig.issuerUrl}/.well-known/openid-configuration`,
                  }),
              scopes: providerConfig.scopes.split(" ").filter(Boolean),
            },
          ],
        }),
      ],
      session: {
        expiresIn: 60 * 60 * 24 * 7, // 7 days
        updateAge: 60 * 60 * 24, // 1 day
        cookieCache: {
          enabled: true,
          maxAge: 5 * 60, // 5 minutes
        },
      },
      trustedOrigins: [process.env.CORS_ORIGIN ?? "http://localhost:5173"],
    });
  })();

  await authInitPromise;
}
