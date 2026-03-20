import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  and,
  eq,
  getDb,
  impersonationSessions,
  impersonationAuditLogs,
  staff,
  clients,
  desc,
} from "@groombook/db";
import type { JwtPayload } from "../middleware/auth.js";

type Env = { Variables: { jwtPayload: JwtPayload } };

export const impersonationRouter = new Hono<Env>();

const SESSION_TIMEOUT_MINUTES = 30;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function expiresAt(minutes = SESSION_TIMEOUT_MINUTES) {
  return new Date(Date.now() + minutes * 60_000);
}

/** Resolve the staff row for the authenticated OIDC subject. */
async function resolveStaff(sub: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(staff)
    .where(eq(staff.oidcSub, sub));
  return row ?? null;
}

/** Expire any timed-out active sessions for a given staff member. */
async function expireTimedOutSessions(staffId: string) {
  const db = getDb();
  const now = new Date();
  const active = await db
    .select()
    .from(impersonationSessions)
    .where(
      and(
        eq(impersonationSessions.staffId, staffId),
        eq(impersonationSessions.status, "active")
      )
    );
  for (const s of active) {
    if (s.expiresAt <= now) {
      await db
        .update(impersonationSessions)
        .set({ status: "expired", endedAt: now })
        .where(eq(impersonationSessions.id, s.id));
    }
  }
}

/**
 * Check if an active session has expired by time. If so, mark it expired in DB
 * and return true. Returns false if the session is still valid.
 */
async function checkAndExpireSession(
  session: typeof impersonationSessions.$inferSelect
): Promise<boolean> {
  if (session.status !== "active") return false;
  if (session.expiresAt > new Date()) return false;
  const db = getDb();
  const now = new Date();
  await db
    .update(impersonationSessions)
    .set({ status: "expired", endedAt: now })
    .where(eq(impersonationSessions.id, session.id));
  return true;
}

// ─── POST / — Start a new impersonation session ─────────────────────────────

const startSessionSchema = z.object({
  clientId: z.string().uuid(),
  reason: z.string().max(500).optional(),
});

impersonationRouter.post(
  "/sessions",
  zValidator("json", startSessionSchema),
  async (c) => {
    const db = getDb();
    const jwt = c.get("jwtPayload") as JwtPayload;
    const body = c.req.valid("json");

    // Resolve authenticated staff
    const staffRow = await resolveStaff(jwt.sub);
    if (!staffRow) return c.json({ error: "Staff record not found" }, 403);
    if (staffRow.role !== "manager") {
      return c.json({ error: "Only managers can impersonate clients" }, 403);
    }

    // Verify client exists
    const [client] = await db
      .select()
      .from(clients)
      .where(eq(clients.id, body.clientId));
    if (!client) return c.json({ error: "Client not found" }, 404);

    // Expire timed-out sessions first
    await expireTimedOutSessions(staffRow.id);

    // Enforce one active session per staff member
    const [existing] = await db
      .select()
      .from(impersonationSessions)
      .where(
        and(
          eq(impersonationSessions.staffId, staffRow.id),
          eq(impersonationSessions.status, "active")
        )
      );
    if (existing) {
      return c.json(
        { error: "You already have an active impersonation session", sessionId: existing.id },
        409
      );
    }

    const [session] = await db
      .insert(impersonationSessions)
      .values({
        staffId: staffRow.id,
        clientId: body.clientId,
        reason: body.reason ?? null,
        expiresAt: expiresAt(),
      })
      .returning();

    // Log session start
    await db.insert(impersonationAuditLogs).values({
      sessionId: session!.id,
      action: "session_started",
      metadata: { reason: body.reason ?? null },
    });

    return c.json(session!, 201);
  }
);

// ─── GET /sessions/:id — Get session details ────────────────────────────────

impersonationRouter.get("/sessions/:id", async (c) => {
  const db = getDb();
  const jwt = c.get("jwtPayload") as JwtPayload;
  const staffRow = await resolveStaff(jwt.sub);
  if (!staffRow) return c.json({ error: "Staff record not found" }, 403);

  const [session] = await db
    .select()
    .from(impersonationSessions)
    .where(eq(impersonationSessions.id, c.req.param("id")));
  if (!session) return c.json({ error: "Session not found" }, 404);
  if (session.staffId !== staffRow.id) {
    return c.json({ error: "Not your session" }, 403);
  }

  // Auto-expire if timed out
  if (await checkAndExpireSession(session)) {
    session.status = "expired";
    session.endedAt = new Date();
  }

  return c.json(session);
});

// ─── POST /sessions/:id/extend — Extend session timeout ─────────────────────

impersonationRouter.post("/sessions/:id/extend", async (c) => {
  const db = getDb();
  const jwt = c.get("jwtPayload") as JwtPayload;
  const staffRow = await resolveStaff(jwt.sub);
  if (!staffRow) return c.json({ error: "Staff record not found" }, 403);

  const [session] = await db
    .select()
    .from(impersonationSessions)
    .where(eq(impersonationSessions.id, c.req.param("id")));
  if (!session) return c.json({ error: "Session not found" }, 404);
  if (session.staffId !== staffRow.id) {
    return c.json({ error: "Not your session" }, 403);
  }
  if (session.status !== "active") {
    return c.json({ error: "Session is not active" }, 400);
  }

  // Check time-based expiry
  if (await checkAndExpireSession(session)) {
    return c.json({ error: "Session has expired" }, 400);
  }

  const newExpiry = expiresAt();
  const [updated] = await db
    .update(impersonationSessions)
    .set({ expiresAt: newExpiry })
    .where(eq(impersonationSessions.id, session.id))
    .returning();

  await db.insert(impersonationAuditLogs).values({
    sessionId: session.id,
    action: "session_extended",
    metadata: { newExpiresAt: newExpiry.toISOString() },
  });

  return c.json(updated);
});

// ─── POST /sessions/:id/end — End session ────────────────────────────────────

impersonationRouter.post("/sessions/:id/end", async (c) => {
  const db = getDb();
  const jwt = c.get("jwtPayload") as JwtPayload;
  const staffRow = await resolveStaff(jwt.sub);
  if (!staffRow) return c.json({ error: "Staff record not found" }, 403);

  const [session] = await db
    .select()
    .from(impersonationSessions)
    .where(eq(impersonationSessions.id, c.req.param("id")));
  if (!session) return c.json({ error: "Session not found" }, 404);
  if (session.staffId !== staffRow.id) {
    return c.json({ error: "Not your session" }, 403);
  }
  if (session.status !== "active") {
    return c.json({ error: "Session is not active" }, 400);
  }

  // Check time-based expiry
  if (await checkAndExpireSession(session)) {
    return c.json({ error: "Session has expired" }, 400);
  }

  const now = new Date();
  const [updated] = await db
    .update(impersonationSessions)
    .set({ status: "ended", endedAt: now })
    .where(eq(impersonationSessions.id, session.id))
    .returning();

  await db.insert(impersonationAuditLogs).values({
    sessionId: session.id,
    action: "session_ended",
  });

  return c.json(updated);
});

// ─── POST /sessions/:id/log — Log an audit entry ────────────────────────────

const logEntrySchema = z.object({
  action: z.string().min(1).max(200),
  pageVisited: z.string().max(500).optional(),
  metadata: z.record(z.unknown()).optional(),
});

impersonationRouter.post(
  "/sessions/:id/log",
  zValidator("json", logEntrySchema),
  async (c) => {
    const db = getDb();
    const jwt = c.get("jwtPayload") as JwtPayload;
    const body = c.req.valid("json");

    const staffRow = await resolveStaff(jwt.sub);
    if (!staffRow) return c.json({ error: "Staff record not found" }, 403);

    const [session] = await db
      .select()
      .from(impersonationSessions)
      .where(eq(impersonationSessions.id, c.req.param("id")));
    if (!session) return c.json({ error: "Session not found" }, 404);
    if (session.staffId !== staffRow.id) {
      return c.json({ error: "Not your session" }, 403);
    }
    if (session.status !== "active") {
      return c.json({ error: "Session is not active" }, 400);
    }

    // Check time-based expiry
    if (await checkAndExpireSession(session)) {
      return c.json({ error: "Session has expired" }, 400);
    }

    const [entry] = await db
      .insert(impersonationAuditLogs)
      .values({
        sessionId: session.id,
        action: body.action,
        pageVisited: body.pageVisited ?? null,
        metadata: body.metadata ?? null,
      })
      .returning();

    return c.json(entry, 201);
  }
);

// ─── GET /sessions/:id/audit-log — Get audit trail ──────────────────────────

impersonationRouter.get("/sessions/:id/audit-log", async (c) => {
  const db = getDb();
  const jwt = c.get("jwtPayload") as JwtPayload;
  const staffRow = await resolveStaff(jwt.sub);
  if (!staffRow) return c.json({ error: "Staff record not found" }, 403);

  const [session] = await db
    .select()
    .from(impersonationSessions)
    .where(eq(impersonationSessions.id, c.req.param("id")));
  if (!session) return c.json({ error: "Session not found" }, 404);
  if (session.staffId !== staffRow.id) {
    return c.json({ error: "Not your session" }, 403);
  }

  const logs = await db
    .select()
    .from(impersonationAuditLogs)
    .where(eq(impersonationAuditLogs.sessionId, session.id))
    .orderBy(desc(impersonationAuditLogs.createdAt));

  return c.json(logs);
});
