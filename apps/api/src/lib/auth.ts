import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { genericOAuth } from "better-auth/plugins";
import { getDb } from "@groombook/db";

const OIDC_ISSUER = process.env.OIDC_ISSUER;
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
          discoveryUrl: OIDC_ISSUER
            ? `${OIDC_ISSUER}/.well-known/openid-configuration`
            : undefined,
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
