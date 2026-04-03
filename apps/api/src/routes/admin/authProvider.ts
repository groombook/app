import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod/v3";
import { eq, getDb, authProviderConfig, encryptSecret } from "@groombook/db";
import { requireSuperUser } from "../../middleware/rbac.js";

export const authProviderRouter = new Hono();

// ─── Schemas ─────────────────────────────────────────────────────────────────

const putAuthProviderSchema = z.object({
  providerId: z.string().min(1).max(100),
  displayName: z.string().min(1).max(200),
  issuerUrl: z.string().url(),
  internalBaseUrl: z.string().url().nullable().optional(),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  scopes: z.string().default("openid profile email"),
});

// ─── GET /api/admin/auth-provider ────────────────────────────────────────────

authProviderRouter.get("/", requireSuperUser(), async (c) => {
  const db = getDb();
  const [row] = await db
    .select()
    .from(authProviderConfig)
    .where(eq(authProviderConfig.enabled, true))
    .limit(1);

  if (!row) {
    return c.json({ exists: false, config: null });
  }

  // Return config with secret redacted
  return c.json({
    exists: true,
    config: {
      id: row.id,
      providerId: row.providerId,
      displayName: row.displayName,
      issuerUrl: row.issuerUrl,
      internalBaseUrl: row.internalBaseUrl,
      clientId: row.clientId,
      clientSecret: "••••••••",
      scopes: row.scopes,
      enabled: row.enabled,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    },
  });
});

// ─── PUT /api/admin/auth-provider ───────────────────────────────────────────

authProviderRouter.put(
  "/",
  requireSuperUser(),
  zValidator("json", putAuthProviderSchema),
  async (c) => {
    const db = getDb();
    const body = c.req.valid("json");

    // Encrypt the client secret before storing
    const encryptedSecret = encryptSecret(body.clientSecret);

    // Check if config already exists
    const [existing] = await db
      .select({ id: authProviderConfig.id })
      .from(authProviderConfig)
      .where(eq(authProviderConfig.providerId, body.providerId))
      .limit(1);

    let saved;
    if (existing) {
      // Update existing
      [saved] = await db
        .update(authProviderConfig)
        .set({
          displayName: body.displayName,
          issuerUrl: body.issuerUrl,
          internalBaseUrl: body.internalBaseUrl ?? null,
          clientId: body.clientId,
          clientSecret: encryptedSecret,
          scopes: body.scopes,
          updatedAt: new Date(),
        })
        .where(eq(authProviderConfig.id, existing.id))
        .returning();
    } else {
      // Insert new
      [saved] = await db
        .insert(authProviderConfig)
        .values({
          providerId: body.providerId,
          displayName: body.displayName,
          issuerUrl: body.issuerUrl,
          internalBaseUrl: body.internalBaseUrl ?? null,
          clientId: body.clientId,
          clientSecret: encryptedSecret,
          scopes: body.scopes,
          enabled: true,
        })
        .returning();
    }

    // Return config with secret redacted
    return c.json({
      id: saved!.id,
      providerId: saved!.providerId,
      displayName: saved!.displayName,
      issuerUrl: saved!.issuerUrl,
      internalBaseUrl: saved!.internalBaseUrl,
      clientId: saved!.clientId,
      clientSecret: "••••••••",
      scopes: saved!.scopes,
      enabled: saved!.enabled,
      createdAt: saved!.createdAt,
      updatedAt: saved!.updatedAt,
    });
  }
);

// ─── POST /api/admin/auth-provider/test ─────────────────────────────────────

const testAuthProviderSchema = z.object({
  issuerUrl: z.string().url(),
  internalBaseUrl: z.string().url().nullable().optional(),
});

authProviderRouter.post(
  "/test",
  requireSuperUser(),
  zValidator("json", testAuthProviderSchema),
  async (c) => {
    const { issuerUrl, internalBaseUrl } = c.req.valid("json");

    // Fetch OIDC discovery document
    const discoveryUrl = internalBaseUrl
      ? `${internalBaseUrl.replace(/\/$/, "")}/application/o/.well-known/openid-configuration`
      : `${issuerUrl.replace(/\/$/, "")}/.well-known/openid-configuration`;

    let metadata: Record<string, unknown> | null = null;
    let errorMessage: string | null = null;

    try {
      const response = await fetch(discoveryUrl, {
        method: "GET",
        headers: { "Accept": "application/json" },
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      } else {
        metadata = (await response.json()) as Record<string, unknown>;
      }
    } catch (err) {
      errorMessage =
        err instanceof Error ? err.message : "Failed to fetch OIDC discovery document";
    }

    if (errorMessage) {
      return c.json({ ok: false, error: errorMessage });
    }

    return c.json({ ok: true, metadata });
  }
);

// ─── DELETE /api/admin/auth-provider ────────────────────────────────────────

authProviderRouter.delete("/", requireSuperUser(), async (c) => {
  const db = getDb();

  // Get the current config
  const [existing] = await db
    .select({ id: authProviderConfig.id })
    .from(authProviderConfig)
    .where(eq(authProviderConfig.enabled, true))
    .limit(1);

  if (!existing) {
    return c.json({ ok: true, message: "No DB config to delete" });
  }

  await db.delete(authProviderConfig).where(eq(authProviderConfig.id, existing.id));

  return c.json({ ok: true, message: "Auth provider config removed; auth will fall back to env vars" });
});
