import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import { clientsRouter } from "./routes/clients.js";
import { petsRouter } from "./routes/pets.js";
import { servicesRouter } from "./routes/services.js";
import { appointmentsRouter } from "./routes/appointments.js";
import { staffRouter } from "./routes/staff.js";
import { invoicesRouter } from "./routes/invoices.js";
import { bookRouter } from "./routes/book.js";
import { reportsRouter } from "./routes/reports.js";
import { appointmentGroupsRouter } from "./routes/appointmentGroups.js";
import { groomingLogsRouter } from "./routes/groomingLogs.js";
import { impersonationRouter } from "./routes/impersonation.js";
import { settingsRouter } from "./routes/settings.js";
import { getDb, businessSettings } from "@groombook/db";
import { authMiddleware } from "./middleware/auth.js";
import { devRouter } from "./routes/dev.js";
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

// Dev/demo routes — config is always public, users endpoint is guarded internally
app.route("/api/dev", devRouter);

// Public branding endpoint — no auth required, returns business name/colors/logo
app.get("/api/branding", async (c) => {
  const db = getDb();
  const [row] = await db.select().from(businessSettings).limit(1);
  const settings = row ?? { businessName: "GroomBook", primaryColor: "#4f8a6f", accentColor: "#8b7355", logoBase64: null, logoMimeType: null };
  return c.json({
    businessName: settings.businessName,
    primaryColor: settings.primaryColor,
    accentColor: settings.accentColor,
    logoBase64: settings.logoBase64,
    logoMimeType: settings.logoMimeType,
  });
});

// Protected API routes
const api = app.basePath("/api");
api.use("*", authMiddleware);

api.route("/clients", clientsRouter);
api.route("/pets", petsRouter);
api.route("/services", servicesRouter);
api.route("/appointments", appointmentsRouter);
api.route("/staff", staffRouter);
api.route("/invoices", invoicesRouter);
api.route("/reports", reportsRouter);
api.route("/appointment-groups", appointmentGroupsRouter);
api.route("/grooming-logs", groomingLogsRouter);
api.route("/impersonation", impersonationRouter);
api.route("/admin/settings", settingsRouter);

const port = Number(process.env.PORT ?? 3000);
console.log(`API server listening on port ${port}`);
serve({ fetch: app.fetch, port });

// Start background reminder scheduler (runs every minute to check for upcoming appointments)
startReminderScheduler();

export default app;
