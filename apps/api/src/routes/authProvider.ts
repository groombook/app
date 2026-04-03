import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod/v3";
import { eq, getDb, authProviderConfig, encryptSecret } from "@groombook/db";
import { requireSuperUser } from "../middleware/rbac.js";
import { reinitAuth } from "../lib/auth.js";

export const authProviderRouter = new Hono();

const REDACTED = "••••••••";

const putAuthProviderSchema = z.object({
  providerId: z.string().min(1).max(100),
  displayName: z.string().min(1).max(200),
  issuerUrl: z.string().url(),
  internalBaseUrl: z.string().url().nullable().optional(),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  scopes: z.string().default("openid profile email"),
});

/**
 * GET /api/admin/auth-provider
 * Returns the current provider config with clientSecret redacted.
 * Returns 404 if no provider is configured.
 */
authProviderRouter.get(
  "/",
  requireSuperUser(),
  async (c) => {
    const db = getDb();
    const [row] = await db
      .select()
      .from(authProviderConfig)
      .where(eq(authProviderConfig.enabled, true))
      .limit(1);

    if (!row) {
      return c.json({ error: "No auth provider configured" }, 404);
    }

    // Return with secret redacted
    return c.json({
      id: row.id,
      providerId: row.providerId,
      displayName: row.displayName,
      issuerUrl: row.issuerUrl,
      internalBaseUrl: row.internalBaseUrl,
      clientId: row.clientId,
      clientSecret: REDACTED,
      scopes: row.scopes,
      enabled: row.enabled,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
);

/**
 * PUT /api/admin/auth-provider
 * Creates or replaces the auth provider config.
 * The clientSecret is encrypted before storage.
 */
authProviderRouter.put(
  "/",
  requireSuperUser(),
  zValidator("json", putAuthProviderSchema),
  async (c) => {
    const db = getDb();
    const body = c.req.valid("json");

    const encryptedSecret = encryptSecret(body.clientSecret);

    // Upsert: delete existing rows then insert atomically
    const [row] = await db.transaction(async (tx) => {
      await tx.delete(authProviderConfig);
      return tx.insert(authProviderConfig).values({
        providerId: body.providerId,
        displayName: body.displayName,
        issuerUrl: body.issuerUrl,
        internalBaseUrl: body.internalBaseUrl ?? null,
        clientId: body.clientId,
        clientSecret: encryptedSecret,
        scopes: body.scopes,
        enabled: true,
      }).returning();
    });

    if (!row) return c.json({ error: "Failed to create auth provider config" }, 500);

    try {
      await reinitAuth();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return c.json({ error: `Failed to reinitialize auth: ${message}` }, 500);
    }

    return c.json({
      id: row.id,
      providerId: row.providerId,
      displayName: row.displayName,
      issuerUrl: row.issuerUrl,
      internalBaseUrl: row.internalBaseUrl,
      clientId: row.clientId,
      clientSecret: REDACTED,
      scopes: row.scopes,
      enabled: row.enabled,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
);

/**
 * POST /api/admin/auth-provider/test
 * Validates the provider config by hitting the OIDC discovery endpoint.
 * Returns {ok: true, metadata} on success or {ok: false, error: string} on failure.
 */
authProviderRouter.post(
  "/test",
  requireSuperUser(),
  zValidator("json", putAuthProviderSchema.omit({ clientSecret: true })),
  async (c) => {
    const body = c.req.valid("json");

    const discoveryUrl = `${body.issuerUrl.replace(/\/$/, "")}/.well-known/openid-configuration`;

    try {
      const res = await fetch(discoveryUrl, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) {
        return c.json({ ok: false, error: `Discovery endpoint returned ${res.status}` });
      }
      const metadata = await res.json() as Record<string, unknown>;
      return c.json({ ok: true, metadata });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return c.json({ ok: false, error: message });
    }
  }
);

/**
 * DELETE /api/admin/auth-provider
 * Removes the auth provider config from the DB.
 * After this, auth falls back to OIDC_* env vars.
 */
authProviderRouter.delete(
  "/",
  requireSuperUser(),
  async (c) => {
    const db = getDb();
    await db.delete(authProviderConfig);
    try {
      await reinitAuth();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return c.json({ error: `Failed to reinitialize auth: ${message}` }, 500);
    }
    return c.json({ ok: true });
  }
);
