import { Hono } from "hono";
import {
  and,
  eq,
  gte,
  lt,
  sql,
  getDb,
  appointments,
  clients,
  invoices,
  invoiceTipSplits,
  services,
  staff,
} from "@groombook/db";

export const reportsRouter = new Hono();

reportsRouter.onError((err, c) => {
  console.error("[reports] unhandled error:", err);
  return c.json({ error: "Internal server error", message: err.message }, 500);
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseDate(value: string | undefined, fallback: Date): Date {
  if (!value) return fallback;
  const d = new Date(value);
  return isNaN(d.getTime()) ? fallback : d;
}

function defaultFrom(): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 30);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function defaultTo(): Date {
  const d = new Date();
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

// ─── Summary ──────────────────────────────────────────────────────────────────
// GET /api/reports/summary?from=&to=
// High-level KPIs for a date range

reportsRouter.get("/summary", async (c) => {
  const db = getDb();
  const from = parseDate(c.req.query("from"), defaultFrom());
  const to = parseDate(c.req.query("to"), defaultTo());

  const [revenueRow] = await db
    .select({
      totalRevenueCents: sql<number>`COALESCE(SUM(${invoices.totalCents}), 0)::int`,
      paidCount: sql<number>`COUNT(*)::int`,
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.status, "paid"),
        gte(invoices.paidAt, from),
        lt(invoices.paidAt, to)
      )
    );

  const [apptRow] = await db
    .select({
      total: sql<number>`COUNT(*)::int`,
      completed: sql<number>`SUM(CASE WHEN ${appointments.status} = 'completed' THEN 1 ELSE 0 END)::int`,
      cancelled: sql<number>`SUM(CASE WHEN ${appointments.status} = 'cancelled' THEN 1 ELSE 0 END)::int`,
      noShow: sql<number>`SUM(CASE WHEN ${appointments.status} = 'no_show' THEN 1 ELSE 0 END)::int`,
    })
    .from(appointments)
    .where(
      and(
        gte(appointments.startTime, from),
        lt(appointments.startTime, to)
      )
    );

  const [clientRow] = await db
    .select({
      totalClients: sql<number>`COUNT(*)::int`,
    })
    .from(clients);

  // New clients in the period
  const [newClientRow] = await db
    .select({
      newClients: sql<number>`COUNT(*)::int`,
    })
    .from(clients)
    .where(
      and(
        gte(clients.createdAt, from),
        lt(clients.createdAt, to)
      )
    );

  return c.json({
    from: from.toISOString(),
    to: to.toISOString(),
    revenue: {
      totalCents: revenueRow?.totalRevenueCents ?? 0,
      paidInvoices: revenueRow?.paidCount ?? 0,
    },
    appointments: {
      total: apptRow?.total ?? 0,
      completed: apptRow?.completed ?? 0,
      cancelled: apptRow?.cancelled ?? 0,
      noShow: apptRow?.noShow ?? 0,
    },
    clients: {
      total: clientRow?.totalClients ?? 0,
      new: newClientRow?.newClients ?? 0,
    },
  });
});

// ─── Revenue by period ────────────────────────────────────────────────────────
// GET /api/reports/revenue?from=&to=&groupBy=day|week|month

reportsRouter.get("/revenue", async (c) => {
  const db = getDb();
  const from = parseDate(c.req.query("from"), defaultFrom());
  const to = parseDate(c.req.query("to"), defaultTo());
  const groupBy = c.req.query("groupBy") ?? "day";

  const truncUnit =
    groupBy === "month" ? "month" : groupBy === "week" ? "week" : "day";

  const byPeriod = await db
    .select({
      period: sql<string>`DATE_TRUNC(${sql.raw(`'${truncUnit}'`)}, ${invoices.paidAt})::text`,
      totalCents: sql<number>`SUM(${invoices.totalCents})::int`,
      invoiceCount: sql<number>`COUNT(*)::int`,
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.status, "paid"),
        gte(invoices.paidAt, from),
        lt(invoices.paidAt, to)
      )
    )
    .groupBy(
      sql`DATE_TRUNC(${sql.raw(`'${truncUnit}'`)}, ${invoices.paidAt})`
    )
    .orderBy(
      sql`DATE_TRUNC(${sql.raw(`'${truncUnit}'`)}, ${invoices.paidAt})`
    );

  // Revenue by groomer (via appointment -> staff join)
  const byGroomer = await db
    .select({
      staffId: staff.id,
      staffName: staff.name,
      totalCents: sql<number>`SUM(${invoices.totalCents})::int`,
      invoiceCount: sql<number>`COUNT(${invoices.id})::int`,
    })
    .from(invoices)
    .innerJoin(appointments, eq(invoices.appointmentId, appointments.id))
    .innerJoin(staff, eq(appointments.staffId, staff.id))
    .where(
      and(
        eq(invoices.status, "paid"),
        gte(invoices.paidAt, from),
        lt(invoices.paidAt, to)
      )
    )
    .groupBy(staff.id, staff.name)
    .orderBy(sql`SUM(${invoices.totalCents}) DESC`);

  return c.json({ from: from.toISOString(), to: to.toISOString(), groupBy, byPeriod, byGroomer });
});

// ─── Appointment analytics ────────────────────────────────────────────────────
// GET /api/reports/appointments?from=&to=&groupBy=day|week|month

reportsRouter.get("/appointments", async (c) => {
  const db = getDb();
  const from = parseDate(c.req.query("from"), defaultFrom());
  const to = parseDate(c.req.query("to"), defaultTo());
  const groupBy = c.req.query("groupBy") ?? "day";

  const truncUnit =
    groupBy === "month" ? "month" : groupBy === "week" ? "week" : "day";

  const byPeriod = await db
    .select({
      period: sql<string>`DATE_TRUNC(${sql.raw(`'${truncUnit}'`)}, ${appointments.startTime})::text`,
      total: sql<number>`COUNT(*)::int`,
      completed: sql<number>`SUM(CASE WHEN ${appointments.status} = 'completed' THEN 1 ELSE 0 END)::int`,
      cancelled: sql<number>`SUM(CASE WHEN ${appointments.status} = 'cancelled' THEN 1 ELSE 0 END)::int`,
      noShow: sql<number>`SUM(CASE WHEN ${appointments.status} = 'no_show' THEN 1 ELSE 0 END)::int`,
    })
    .from(appointments)
    .where(
      and(
        gte(appointments.startTime, from),
        lt(appointments.startTime, to)
      )
    )
    .groupBy(
      sql`DATE_TRUNC(${sql.raw(`'${truncUnit}'`)}, ${appointments.startTime})`
    )
    .orderBy(
      sql`DATE_TRUNC(${sql.raw(`'${truncUnit}'`)}, ${appointments.startTime})`
    );

  return c.json({ from: from.toISOString(), to: to.toISOString(), groupBy, byPeriod });
});

// ─── Service popularity ───────────────────────────────────────────────────────
// GET /api/reports/services?from=&to=

reportsRouter.get("/services", async (c) => {
  const db = getDb();
  const from = parseDate(c.req.query("from"), defaultFrom());
  const to = parseDate(c.req.query("to"), defaultTo());

  const rows = await db
    .select({
      serviceId: services.id,
      serviceName: services.name,
      appointmentCount: sql<number>`COUNT(${appointments.id})::int`,
      completedCount: sql<number>`SUM(CASE WHEN ${appointments.status} = 'completed' THEN 1 ELSE 0 END)::int`,
      revenueCents: sql<number>`COALESCE(SUM(CASE WHEN ${invoices.status} = 'paid' THEN ${invoices.totalCents} ELSE 0 END), 0)::int`,
    })
    .from(services)
    .leftJoin(
      appointments,
      and(
        eq(appointments.serviceId, services.id),
        gte(appointments.startTime, from),
        lt(appointments.startTime, to)
      )
    )
    .leftJoin(invoices, eq(invoices.appointmentId, appointments.id))
    .groupBy(services.id, services.name)
    .orderBy(sql`COUNT(${appointments.id}) DESC`);

  return c.json({ from: from.toISOString(), to: to.toISOString(), rows });
});

// ─── Client retention ─────────────────────────────────────────────────────────
// GET /api/reports/clients?from=&to=
// Returns: new clients, returning clients, clients with no recent activity (churn risk)

reportsRouter.get("/clients", async (c) => {
  const db = getDb();
  const from = parseDate(c.req.query("from"), defaultFrom());
  const to = parseDate(c.req.query("to"), defaultTo());

  // New clients in period
  const newClients = await db
    .select({
      clientId: clients.id,
      clientName: clients.name,
      createdAt: clients.createdAt,
    })
    .from(clients)
    .where(and(gte(clients.createdAt, from), lt(clients.createdAt, to)))
    .orderBy(clients.createdAt);

  // Active clients in period (had at least 1 appointment)
  const activeInPeriod = await db
    .select({
      clientId: appointments.clientId,
      appointmentCount: sql<number>`COUNT(*)::int`,
    })
    .from(appointments)
    .where(
      and(
        gte(appointments.startTime, from),
        lt(appointments.startTime, to),
        eq(appointments.status, "completed")
      )
    )
    .groupBy(appointments.clientId);

  // Clients with no appointment in last 90 days (churn risk)
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setUTCDate(ninetyDaysAgo.getUTCDate() - 90);
  const ninetyDaysAgoISO = ninetyDaysAgo.toISOString();

  const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query("limit") ?? "20", 10) || 20));
  const offset = (page - 1) * limit;

  const churnRisk = await db
    .select({
      clientId: clients.id,
      clientName: clients.name,
      lastAppointmentAt: sql<string | null>`MAX(${appointments.startTime})::text`,
    })
    .from(clients)
    .leftJoin(appointments, eq(appointments.clientId, clients.id))
    .groupBy(clients.id, clients.name)
    .having(
      sql`MAX(${appointments.startTime}) < ${ninetyDaysAgoISO}::timestamptz OR MAX(${appointments.startTime}) IS NULL`
    )
    .orderBy(sql`MAX(${appointments.startTime}) ASC NULLS FIRST`)
    .limit(limit)
    .offset(offset);

  const [churnCountRow] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(
      db
        .select({ id: clients.id })
        .from(clients)
        .leftJoin(appointments, eq(appointments.clientId, clients.id))
        .groupBy(clients.id)
        .having(
          sql`MAX(${appointments.startTime}) < ${ninetyDaysAgoISO}::timestamptz OR MAX(${appointments.startTime}) IS NULL`
        )
        .as("churn_count")
    );
  const churnRiskTotal = churnCountRow?.total ?? 0;

  return c.json({
    from: from.toISOString(),
    to: to.toISOString(),
    newClients,
    activeInPeriodCount: activeInPeriod.length,
    churnRisk,
    churnRiskTotal,
    page,
    limit,
  });
});

// ─── Tip splits payroll report ────────────────────────────────────────────────
// GET /api/reports/tip-splits?from=&to=
// Aggregates tip earnings per staff member for the period

reportsRouter.get("/tip-splits", async (c) => {
  const db = getDb();
  const from = parseDate(c.req.query("from"), defaultFrom());
  const to = parseDate(c.req.query("to"), defaultTo());

  const rows = await db
    .select({
      staffId: invoiceTipSplits.staffId,
      staffName: invoiceTipSplits.staffName,
      totalTipCents: sql<number>`SUM(${invoiceTipSplits.shareCents})::int`,
      invoiceCount: sql<number>`COUNT(DISTINCT ${invoiceTipSplits.invoiceId})::int`,
    })
    .from(invoiceTipSplits)
    .innerJoin(invoices, eq(invoiceTipSplits.invoiceId, invoices.id))
    .where(
      and(
        eq(invoices.status, "paid"),
        gte(invoices.paidAt, from),
        lt(invoices.paidAt, to)
      )
    )
    .groupBy(invoiceTipSplits.staffId, invoiceTipSplits.staffName)
    .orderBy(sql`SUM(${invoiceTipSplits.shareCents}) DESC`);

  return c.json({ from: from.toISOString(), to: to.toISOString(), rows });
});

// ─── CSV export ───────────────────────────────────────────────────────────────
// GET /api/reports/export.csv?type=revenue|appointments|services&from=&to=

reportsRouter.get("/export.csv", async (c) => {
  const db = getDb();
  const type = c.req.query("type") ?? "revenue";
  const from = parseDate(c.req.query("from"), defaultFrom());
  const to = parseDate(c.req.query("to"), defaultTo());

  let csv = "";

  if (type === "revenue") {
    const rows = await db
      .select({
        paidAt: invoices.paidAt,
        clientId: invoices.clientId,
        totalCents: invoices.totalCents,
        subtotalCents: invoices.subtotalCents,
        taxCents: invoices.taxCents,
        tipCents: invoices.tipCents,
        paymentMethod: invoices.paymentMethod,
        staffName: staff.name,
      })
      .from(invoices)
      .leftJoin(appointments, eq(invoices.appointmentId, appointments.id))
      .leftJoin(staff, eq(appointments.staffId, staff.id))
      .where(
        and(
          eq(invoices.status, "paid"),
          gte(invoices.paidAt, from),
          lt(invoices.paidAt, to)
        )
      )
      .orderBy(invoices.paidAt);

    csv = "Date,Groomer,Total,Subtotal,Tax,Tip,Payment Method\n";
    csv += rows
      .map((r) =>
        [
          r.paidAt ? new Date(r.paidAt).toLocaleDateString() : "",
          r.staffName ?? "",
          (r.totalCents / 100).toFixed(2),
          (r.subtotalCents / 100).toFixed(2),
          (r.taxCents / 100).toFixed(2),
          (r.tipCents / 100).toFixed(2),
          r.paymentMethod ?? "",
        ].join(",")
      )
      .join("\n");
  } else if (type === "appointments") {
    const rows = await db
      .select({
        startTime: appointments.startTime,
        status: appointments.status,
        clientId: appointments.clientId,
        clientName: clients.name,
        serviceName: services.name,
        staffName: staff.name,
      })
      .from(appointments)
      .leftJoin(clients, eq(appointments.clientId, clients.id))
      .leftJoin(services, eq(appointments.serviceId, services.id))
      .leftJoin(staff, eq(appointments.staffId, staff.id))
      .where(
        and(
          gte(appointments.startTime, from),
          lt(appointments.startTime, to)
        )
      )
      .orderBy(appointments.startTime);

    csv = "Date,Client,Service,Groomer,Status\n";
    csv += rows
      .map((r) =>
        [
          new Date(r.startTime).toLocaleDateString(),
          `"${(r.clientName ?? "").replace(/"/g, '""')}"`,
          `"${(r.serviceName ?? "").replace(/"/g, '""')}"`,
          r.staffName ?? "",
          r.status,
        ].join(",")
      )
      .join("\n");
  } else if (type === "services") {
    const rows = await db
      .select({
        serviceName: services.name,
        appointmentCount: sql<number>`COUNT(${appointments.id})::int`,
        completedCount: sql<number>`SUM(CASE WHEN ${appointments.status} = 'completed' THEN 1 ELSE 0 END)::int`,
      })
      .from(services)
      .leftJoin(
        appointments,
        and(
          eq(appointments.serviceId, services.id),
          gte(appointments.startTime, from),
          lt(appointments.startTime, to)
        )
      )
      .groupBy(services.id, services.name)
      .orderBy(sql`COUNT(${appointments.id}) DESC`);

    csv = "Service,Total Appointments,Completed\n";
    csv += rows
      .map((r) =>
        [
          `"${r.serviceName.replace(/"/g, '""')}"`,
          r.appointmentCount,
          r.completedCount,
        ].join(",")
      )
      .join("\n");
  } else {
    return c.json({ error: "Invalid type. Use revenue, appointments, or services." }, 400);
  }

  const filename = `groombook-${type}-report.csv`;
  c.header("Content-Type", "text/csv");
  c.header("Content-Disposition", `attachment; filename="${filename}"`);
  return c.text(csv);
});
