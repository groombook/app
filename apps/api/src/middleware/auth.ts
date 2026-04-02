import type { MiddlewareHandler } from "hono";
import { getAuth } from "../lib/auth.js";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

// Guard: refuse to start with AUTH_DISABLED in production.
if (process.env.AUTH_DISABLED === "true") {
  if (process.env.NODE_ENV === "production") {
    console.error(
      "[FATAL] AUTH_DISABLED=true is not allowed in production. " +
        "Remove AUTH_DISABLED from your environment and configure Better-Auth."
    );
    process.exit(1);
  }
  console.warn(
    "[WARNING] AUTH_DISABLED=true — authentication is bypassed. " +
      "Do NOT use this in production."
  );
}

export const authMiddleware: MiddlewareHandler = async (c, next) => {
  // Better-Auth's own routes handle their own auth (OAuth callbacks, session mgmt)
  if (c.req.path.startsWith("/api/auth/")) {
    await next();
    return;
  }

  if (process.env.AUTH_DISABLED === "true") {
    const devUserId = c.req.header("X-Dev-User-Id");
    const sub = devUserId ?? "dev-user";
    c.set("jwtPayload", { sub } as { sub: string });
    await next();
    return;
  }

  const session = await getAuth().api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  // Set jwtPayload with sub = Better-Auth user ID for backward compat with resolveStaffMiddleware
  c.set("jwtPayload", {
    sub: session.user.id,
    email: session.user.email,
    name: session.user.name,
  });
  await next();
};
