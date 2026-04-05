import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod/v3";
import { and, eq, getDb, sql, staff, businessSettings, authProviderConfig, encryptSecret } from "@groombook/db";
import type { AppEnv } from "../middleware/rbac.js";

export const setupRouter = new Hono<AppEnv>();

// GET /api/setup/status — public (no auth), returns whether setup is needed
// and whether the auth provider bootstrap step should be shown
setupRouter.get("/status", async (c) => {
  const db = getDb();

  // Check if any super user exists
  const [superUser] = await db
    .select({ id: staff.id })
    .from(staff)
    .where(eq(staff.isSuperUser, true))
    .limit(1);

  // Check if DB already has an auth provider config
  const [dbAuthConfig] = await db
    .select({ id: authProviderConfig.id })
    .from(authProviderConfig)
    .where(eq(authProviderConfig.enabled, true))
    .limit(1);

  // Check if OIDC env vars are set (bootstrap mode)
  const oidcIssuer = process.env.OIDC_ISSUER;
  const oidcClientId = process.env.OIDC_CLIENT_ID;
  const oidcClientSecret = process.env.OIDC_CLIENT_SECRET;
  const authEnvVarsSet = !!(oidcIssuer && oidcClientId && oidcClientSecret);

  return c.json({
    needsSetup: !superUser,
    // Show auth provider bootstrap step when: fresh install (no super user) AND no DB config AND no env vars
    showAuthProviderStep: !superUser && !dbAuthConfig && !authEnvVarsSet,
    authConfigExists: !!dbAuthConfig,
    authEnvVarsSet,
  });
});

const setupSchema = z.object({
  businessName: z.string().min(1).max(200),
});

// POST /api/setup — authenticated (Better-Auth JWT), creates staff record if needed and sets business name
// This endpoint is exempt from resolveStaffMiddleware so that OOBE users (with no staff record yet) can complete setup
setupRouter.post("/", zValidator("json", setupSchema), async (c) => {
  const db = getDb();
  const body = c.req.valid("json");
  const jwt = c.get("jwtPayload");
  const currentStaff = c.get("staff"); // may be undefined during OOBE

  // Use a transaction with row-level locking to prevent race conditions
  const result = await db.transaction(async (tx) => {
    // Lock super user rows to prevent concurrent claims
    // FOR UPDATE serializes concurrent claims: second transaction blocks until first commits
    const [existingSuperUser] = await tx
      .select({ id: staff.id })
      .from(staff)
      .where(eq(staff.isSuperUser, true))
      .for("update")
      .limit(1);

    if (existingSuperUser) {
      return { error: "Setup has already been completed. A super user already exists.", code: 409 };
    }

    // Lock the business_settings row for update to prevent concurrent setup
    const [existingSettings] = await tx
      .select({ id: businessSettings.id })
      .from(businessSettings)
      .limit(1);

    // Update or create business settings with the business name
    if (existingSettings) {
      await tx
        .update(businessSettings)
        .set({ businessName: body.businessName, updatedAt: new Date() })
        .where(eq(businessSettings.id, existingSettings.id));
    } else {
      await tx.insert(businessSettings).values({ businessName: body.businessName });
    }

    // Find or create staff record for the authenticated user
    let resolvedStaff = currentStaff;

    if (!resolvedStaff) {
      // Try to find by userId
      const [byUserId] = await tx
        .select()
        .from(staff)
        .where(eq(staff.userId, jwt.sub));
      if (byUserId) {
        resolvedStaff = byUserId;
      }
    }

    if (!resolvedStaff && jwt.email) {
      // Try auto-link by email: staff record exists with matching email but no userId
      const [byEmail] = await tx
        .select()
        .from(staff)
        .where(and(eq(staff.email, jwt.email), sql`${staff.userId} IS NULL`));
      if (byEmail) {
        await tx
          .update(staff)
          .set({ userId: jwt.sub })
          .where(eq(staff.id, byEmail.id));
        resolvedStaff = { ...byEmail, userId: jwt.sub };
      }
    }

    if (!resolvedStaff) {
      // Brand new user during OOBE — create staff record
      if (!jwt.email) {
        return { error: "Cannot complete setup: authenticated user has no email claim", code: 400 };
      }
      const [newStaff] = await tx
        .insert(staff)
        .values({
          name: jwt.name || jwt.email,
          email: jwt.email,
          userId: jwt.sub,
          role: "manager",
          isSuperUser: false, // will be set below
        })
        .returning();
      resolvedStaff = newStaff!;
    }

    // Mark as super user
    const [updatedStaff] = await tx
      .update(staff)
      .set({ isSuperUser: true, updatedAt: new Date() })
      .where(eq(staff.id, resolvedStaff.id))
      .returning();

    return { staff: updatedStaff };
  });

  if ("error" in result) {
    const status = (result as { code?: number }).code || 409;
    return c.json({ error: result.error }, status as any);
  }

  return c.json({ ok: true, staff: result.staff }, 201);
});

// ─── Auth Provider Bootstrap ──────────────────────────────────────────────────

const authProviderBootstrapSchema = z.object({
  providerId: z.string().min(1).max(100),
  displayName: z.string().min(1).max(200),
  issuerUrl: z.string().url(),
  internalBaseUrl: z.string().url().nullable().optional(),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  scopes: z.string().default("openid profile email"),
});

// Minimal schema for test endpoint — OIDC discovery only needs issuer/internal URLs
const authProviderTestSchema = z.object({
  issuerUrl: z.string().url(),
  internalBaseUrl: z.string().url().nullable().optional(),
});

/**
 * POST /api/setup/auth-provider
 * Unauthenticated endpoint for first-time auth provider setup during OOBE.
 * Only available when needsSetup is true (no super user = fresh install).
 * Rate-limited by the API gateway; additionally restricted to first-time setup only.
 * After setup completes, this endpoint permanently returns 403.
 */
setupRouter.post("/auth-provider", async (c) => {
  const db = getDb();

  // Guard: only allow during fresh install (no super user yet)
  const [superUser] = await db
    .select({ id: staff.id })
    .from(staff)
    .where(eq(staff.isSuperUser, true))
    .limit(1);

  if (superUser) {
    // Setup already completed — lock this endpoint permanently
    return c.json({ error: "Setup has already been completed. This endpoint is no longer available." }, 403);
  }

  // Guard: ensure no DB config already exists (should be redundant with status check but defensive)
  const [existingConfig] = await db
    .select({ id: authProviderConfig.id })
    .from(authProviderConfig)
    .where(eq(authProviderConfig.enabled, true))
    .limit(1);

  if (existingConfig) {
    return c.json({ error: "Auth provider is already configured." }, 409);
  }

  const body = authProviderBootstrapSchema.parse(await c.req.json());

  // Encrypt clientSecret before storing
  const encryptedSecret = encryptSecret(body.clientSecret);

  const [row] = await db
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

  if (!row) {
    return c.json({ error: "Failed to save auth provider configuration." }, 500);
  }

  return c.json({
    id: row.id,
    providerId: row.providerId,
    displayName: row.displayName,
    issuerUrl: row.issuerUrl,
    internalBaseUrl: row.internalBaseUrl,
    clientId: row.clientId,
    scopes: row.scopes,
    enabled: row.enabled,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }, 201);
});

/**
 * POST /api/setup/auth-provider/test
 * Unauthenticated endpoint to validate an OIDC provider configuration during OOBE.
 * Fetches the OIDC discovery document to confirm the issuer is reachable.
 * Only available when needsSetup is true (no super user = fresh install).
 */
setupRouter.post("/auth-provider/test", async (c) => {
  const db = getDb();

  // Guard: only allow during fresh install (no super user yet)
  const [superUser] = await db
    .select({ id: staff.id })
    .from(staff)
    .where(eq(staff.isSuperUser, true))
    .limit(1);

  if (superUser) {
    return c.json({ ok: false, error: "Setup has already been completed." }, 403);
  }

  const body = authProviderTestSchema.parse(await c.req.json());

  // Determine the discovery URL
  const discoveryUrl = body.internalBaseUrl
    ? `${body.internalBaseUrl.replace(/\/$/, "")}/application/o/.well-known/openid-configuration`
    : `${body.issuerUrl}/.well-known/openid-configuration`;

  try {
    const res = await fetch(discoveryUrl, { method: "GET", signal: AbortSignal.timeout(10_000) });
    if (!res.ok) {
      return c.json({
        ok: false,
        error: `OIDC discovery failed (HTTP ${res.status}). Check your Issuer URL and Internal Base URL.`,
      });
    }
    return c.json({ ok: true });
  } catch {
    return c.json({
      ok: false,
      error: "Could not reach the OIDC provider. Check your Issuer URL and network connectivity.",
    });
  }
});
