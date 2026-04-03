import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import { getAuth, initAuth } from "./lib/auth.js";
import { clientsRouter } from "./routes/clients.js";
import { petsRouter } from "./routes/pets.js";
import { servicesRouter } from "./routes/services.js";
import { appointmentsRouter } from "./routes/appointments.js";
import { waitlistRouter } from "./routes/waitlist.js";
import { portalRouter } from "./routes/portal.js";
import { staffRouter } from "./routes/staff.js";
import { invoicesRouter } from "./routes/invoices.js";
import { bookRouter } from "./routes/book.js";
import { reportsRouter } from "./routes/reports.js";
import { appointmentGroupsRouter } from "./routes/appointmentGroups.js";
import { groomingLogsRouter } from "./routes/groomingLogs.js";
import { impersonationRouter } from "./routes/impersonation.js";
import { settingsRouter } from "./routes/settings.js";
import { authProviderRouter } from "./routes/authProvider.js";
import { searchRouter } from "./routes/search.js";
import { getPresignedGetUrl } from "./lib/s3.js";
import { calendarRouter } from "./routes/calendar.js";
import { setupRouter } from "./routes/setup.js";
import { getDb, businessSettings, eq, staff } from "@groombook/db";
import { authMiddleware } from "./middleware/auth.js";
import { resolveStaffMiddleware, requireRole, requireRoleOrSuperUser, requireSuperUser } from "./middleware/rbac.js";
import { devRouter } from "./routes/dev.js";
import { adminSeedRouter } from "./routes/admin/seed.js";
import { startReminderScheduler } from "./services/reminders.js";

const app = new Hono();

// Global middleware
app.use("*", logger());
app.use(
  "/api/*",
  cors({
    origin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
    credentials: true,
  })
);

// Health check (no auth required)
app.get("/health", (c) => c.json({ status: "ok" }));

// Public booking routes — no auth required, must be registered before auth middleware
app.route("/api/book", bookRouter);

// Public portal routes — client-facing, authenticated via impersonation session header
app.route("/api/portal", portalRouter);

// Dev/demo routes — config is always public, users endpoint is guarded internally
app.route("/api/dev", devRouter);

// Public branding endpoint — no auth required, returns business name/colors/logo
app.get("/api/branding", async (c) => {
  const db = getDb();
  const [row] = await db.select().from(businessSettings).limit(1);
  const settings = row ?? { businessName: "GroomBook", primaryColor: "#4f8a6f", accentColor: "#8b7355", logoBase64: null, logoMimeType: null, logoKey: null };

  let logoUrl: string | null = null;
  if (settings.logoKey) {
    try {
      logoUrl = await getPresignedGetUrl(settings.logoKey);
    } catch {
      // If S3 URL generation fails, fall back to legacy base64
    }
  }

  return c.json({
    businessName: settings.businessName,
    primaryColor: settings.primaryColor,
    accentColor: settings.accentColor,
    logoUrl,
    logoBase64: settings.logoBase64,
    logoMimeType: settings.logoMimeType,
  });
});

// Public iCal calendar feed — token auth in URL, no auth middleware required
app.route("/api/calendar", calendarRouter);

// Public setup status — no auth required, must be registered before auth middleware
app.get("/api/setup/status", async (c) => {
  const db = getDb();
  const [superUser] = await db
    .select({ id: staff.id })
    .from(staff)
    .where(eq(staff.isSuperUser, true))
    .limit(1);
  return c.json({ needsSetup: !superUser });
});

// Protected API routes
const api = app.basePath("/api");
api.use("*", authMiddleware);
api.use("*", resolveStaffMiddleware);

// Better-Auth handler — mounted as sub-app to handle all /api/auth/* routes
// authMiddleware and resolveStaffMiddleware both skip /api/auth/ paths
const authRouter = new Hono();
authRouter.all("/*", (c) => getAuth().handler(c.req.raw));
api.route("/auth", authRouter);

// ── Role guards ────────────────────────────────────────────────────────────────
// Manager-only: admin settings, reports, invoices, impersonation
// Staff CRUD: all roles may READ; manager-only for CREATE/UPDATE/DELETE
api.on(["GET"], "/staff/*", requireRole("manager", "receptionist", "groomer"));
// Staff write routes: manager OR super-user (combined guard — avoids AND stacking)
api.on(["POST", "PATCH", "DELETE"], "/staff/*", requireRoleOrSuperUser("manager"));
api.use("/admin/*", requireRole("manager"));
api.use("/admin/settings/*", requireSuperUser());
api.use("/reports/*", requireRole("manager"));
api.use("/invoices/*", requireRole("manager"));
api.use("/impersonation/*", requireRole("manager"));

// Manager + Receptionist only (groomers have no access): appointment-groups, grooming-logs, waitlist
api.use("/appointment-groups/*", requireRole("manager", "receptionist"));
api.use("/grooming-logs/*", requireRole("manager", "receptionist"));
api.use("/waitlist/*", requireRole("manager", "receptionist"));

// Pet photo routes: all staff roles may upload/delete (groomers take photos during grooms)
// These must be registered before the general pets write guard. Because Hono path params
// match single segments, "/pets/:petId" does NOT match "/pets/:petId/photo/:action",
// so there is no guard overlap.
api.on(
  ["POST", "DELETE"],
  ["/pets/:petId/photo", "/pets/:petId/photo/:action"],
  requireRole("manager", "receptionist", "groomer")
);

// Clients, appointments: all roles may read; only manager + receptionist may write
api.on(
  ["POST", "PUT", "PATCH", "DELETE"],
  ["/clients/*", "/appointments/*"],
  requireRole("manager", "receptionist")
);

// Pets (non-photo CRUD): manager + receptionist for writes
// ":petId" matches only single-segment paths — photo sub-routes are unaffected
api.post("/pets", requireRole("manager", "receptionist"));
api.on(["PUT", "PATCH", "DELETE"], "/pets/:petId", requireRole("manager", "receptionist"));

// Services: all roles may read; only managers may write
api.on(
  ["POST", "PUT", "PATCH", "DELETE"],
  "/services/*",
  requireRole("manager")
);
// ──────────────────────────────────────────────────────────────────────────────

// Setup: POST /api/setup (authenticated) — requires staff context from auth middleware
api.route("/setup", setupRouter);

api.route("/clients", clientsRouter);
api.route("/pets", petsRouter);
api.route("/services", servicesRouter);
api.route("/appointments", appointmentsRouter);
api.route("/waitlist", waitlistRouter);
api.route("/staff", staffRouter);
api.route("/invoices", invoicesRouter);
api.route("/reports", reportsRouter);
api.route("/appointment-groups", appointmentGroupsRouter);
api.route("/grooming-logs", groomingLogsRouter);
api.route("/impersonation", impersonationRouter);
api.route("/admin/settings", settingsRouter);
api.route("/admin/auth-provider", authProviderRouter);
api.route("/admin/seed", adminSeedRouter);
api.route("/search", searchRouter);

const port = Number(process.env.PORT ?? 3000);
await initAuth();
console.log(`API server listening on port ${port}`);
serve({ fetch: app.fetch, port });

// Start background reminder scheduler (runs every minute to check for upcoming appointments)
startReminderScheduler();

export default app;
