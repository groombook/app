import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "./rbac.js";

const CSRF_SAFE_METHODS = ["GET", "HEAD", "OPTIONS"];

export const csrfMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (CSRF_SAFE_METHODS.includes(c.req.method)) {
    await next();
    return;
  }

  const csrfHeader = c.req.header("x-csrf-token");
  if (!csrfHeader) {
    return c.json({ error: "CSRF token required" }, 403);
  }

  await next();
};