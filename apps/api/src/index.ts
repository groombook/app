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
import { authMiddleware } from "./middleware/auth.js";

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

// Protected API routes
const api = app.basePath("/api");
api.use("*", authMiddleware);

api.route("/clients", clientsRouter);
api.route("/pets", petsRouter);
api.route("/services", servicesRouter);
api.route("/appointments", appointmentsRouter);
api.route("/staff", staffRouter);
api.route("/invoices", invoicesRouter);

const port = Number(process.env.PORT ?? 3000);
console.log(`API server listening on port ${port}`);
serve({ fetch: app.fetch, port });

export default app;
