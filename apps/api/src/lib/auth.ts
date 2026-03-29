import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { genericOAuth } from "better-auth/plugins";
import { getDb } from "@groombook/db";

const OIDC_ISSUER = process.env.OIDC_ISSUER;
const OIDC_INTERNAL_BASE = process.env.OIDC_INTERNAL_BASE; // e.g. http://authentik-server.auth.svc.cluster.local
const OIDC_CLIENT_ID = process.env.OIDC_CLIENT_ID;
const OIDC_CLIENT_SECRET = process.env.OIDC_CLIENT_SECRET;
const BETTER_AUTH_SECRET = process.env.BETTER_AUTH_SECRET;
const BETTER_AUTH_URL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

if (!BETTER_AUTH_SECRET && process.env.AUTH_DISABLED !== "true") {
  throw new Error(
    "[FATAL] BETTER_AUTH_SECRET environment variable is required when auth is enabled"
  );
}

export const auth = betterAuth({
  database: drizzleAdapter(getDb(), {
    provider: "pg",
  }),
  secret: BETTER_AUTH_SECRET,
  baseURL: BETTER_AUTH_URL,
  plugins: [
    genericOAuth({
      config: [
        {
          providerId: "authentik",
          clientId: OIDC_CLIENT_ID ?? "",
          clientSecret: OIDC_CLIENT_SECRET ?? "",
          // When OIDC_INTERNAL_BASE is set, use explicit URLs to avoid hairpin NAT:
          // - authorizationUrl: external (browser redirect, no server-side fetch)
          // - tokenUrl/userInfoUrl: internal (server-to-server, avoids hairpin)
          // When not set, fall back to discoveryUrl for local dev.
          ...(OIDC_INTERNAL_BASE
            ? {
                authorizationUrl: `${new URL(OIDC_ISSUER!).origin}/application/o/authorize/`,
                tokenUrl: `${OIDC_INTERNAL_BASE}/application/o/token/`,
                userInfoUrl: `${OIDC_INTERNAL_BASE}/application/o/userinfo/`,
              }
            : {
                discoveryUrl: OIDC_ISSUER
                  ? `${OIDC_ISSUER}/.well-known/openid-configuration`
                  : undefined,
              }),
          scopes: ["openid", "profile", "email"],
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
