import type { MiddlewareHandler } from "hono";
import { createRemoteJWKSet, jwtVerify } from "jose";

// Authentik OIDC configuration — loaded from env at startup
const OIDC_ISSUER = process.env.OIDC_ISSUER;
const OIDC_AUDIENCE = process.env.OIDC_AUDIENCE;

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks() {
  if (!OIDC_ISSUER) throw new Error("OIDC_ISSUER is not set");
  if (!jwks) {
    jwks = createRemoteJWKSet(
      new URL(`${OIDC_ISSUER}/application/o/groombook/jwks/`)
    );
  }
  return jwks;
}

export interface JwtPayload {
  sub: string;
  email?: string;
  name?: string;
}

export const authMiddleware: MiddlewareHandler = async (c, next) => {
  const authorization = c.req.header("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authorization.slice(7);

  try {
    const { payload } = await jwtVerify(token, getJwks(), {
      issuer: OIDC_ISSUER,
      audience: OIDC_AUDIENCE,
    });

    c.set("jwtPayload", payload as JwtPayload);
    await next();
  } catch {
    return c.json({ error: "Invalid or expired token" }, 401);
  }
};
