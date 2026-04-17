import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod/v3";
import {
  and,
  eq,
  getDb,
  invoices,
  invoiceLineItems,
  invoiceTipSplits,
  refunds,
  appointments,
  services,
  clients,
  sql,
} from "@groombook/db";
import type { AppEnv } from "../middleware/rbac.js";

export const invoicesRouter = new Hono<AppEnv>();

// Convert Zod validation errors from 422 to 400
invoicesRouter.onError((err, c) => {
  if (err instanceof z.ZodError) {
    return c.json({ error: "Validation failed", issues: err.issues }, 400);
  }
  throw err;
});

const createInvoiceSchema = z.object({
  appointmentId: z.string().uuid().optional(),
  clientId: z.string().uuid(),
  lineItems: z
    .array(
      z.object({
        description: z.string().min(1).max(500),
        quantity: z.number().int().positive().default(1),
        unitPriceCents: z.number().int().nonnegative(),
      })
    )
    .min(1),
  taxCents: z.number().int().nonnegative().default(0),
  tipCents: z.number().int().nonnegative().default(0),
  notes: z.string().max(2000).optional(),
});

const updateInvoiceSchema = z.object({
  status: z.enum(["draft", "pending", "paid", "void"]).optional(),
  paymentMethod: z.enum(["cash", "card", "check", "other"]).nullable().optional(),
  paidAt: z.string().datetime().nullable().optional(),
  taxCents: z.number().int().nonnegative().optional(),
  tipCents: z.number().int().nonnegative().optional(),
  notes: z.string().max(2000).nullable().optional(),
  tipSplits: z.array(
    z.object({
      staffId: z.string().uuid().nullable(),
      staffName: z.string().min(1).max(200),
      sharePct: z.number().min(0).max(100),
    })
  ).optional(),
});

// List invoices
const listInvoicesQuerySchema = z.object({
  clientId: z.string().uuid().optional(),
  appointmentId: z.string().uuid().optional(),
  status: z.enum(["draft", "pending", "paid", "void"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

invoicesRouter.get(
  "/",
  zValidator("query", listInvoicesQuerySchema),
  async (c) => {
    const db = getDb();
    const { clientId, appointmentId, status, limit, offset } = c.req.valid("query");

    const conditions = [];
    if (clientId) conditions.push(eq(invoices.clientId, clientId));
    if (appointmentId) conditions.push(eq(invoices.appointmentId, appointmentId));
    if (status) conditions.push(eq(invoices.status, status as "draft" | "pending" | "paid" | "void"));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(invoices)
      .where(whereClause);

    const rows = await db
      .select({
        id: invoices.id,
        appointmentId: invoices.appointmentId,
        clientId: invoices.clientId,
        clientName: clients.name,
        subtotalCents: invoices.subtotalCents,
        taxCents: invoices.taxCents,
        tipCents: invoices.tipCents,
        totalCents: invoices.totalCents,
        status: invoices.status,
        paymentMethod: invoices.paymentMethod,
        paidAt: invoices.paidAt,
        notes: invoices.notes,
        createdAt: invoices.createdAt,
        updatedAt: invoices.updatedAt,
      })
      .from(invoices)
      .leftJoin(clients, eq(invoices.clientId, clients.id))
      .where(whereClause)
      .orderBy(invoices.createdAt)
      .limit(limit)
      .offset(offset);

    return c.json({ data: rows, total: totalResult?.count ?? 0 });
  }
);

// Get single invoice with line items and tip splits
invoicesRouter.get("/:id", async (c) => {
  const db = getDb();
  const id = c.req.param("id");

  const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id));
  if (!invoice) return c.json({ error: "Not found" }, 404);

  const [lineItems, tipSplits] = await Promise.all([
    db.select().from(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, id)),
    db.select().from(invoiceTipSplits).where(eq(invoiceTipSplits.invoiceId, id)),
  ]);

  return c.json({ ...invoice, lineItems, tipSplits });
});

// Save tip splits for an invoice (replaces existing splits)
const tipSplitSchema = z.object({
  splits: z.array(
    z.object({
      staffId: z.string().uuid().nullable(),
      staffName: z.string().min(1).max(200),
      sharePct: z.number().min(0).max(100),
    })
  ).min(1).refine(
    (splits) => {
      const totalBps = splits.reduce((sum, s) => sum + Math.round(s.sharePct * 100), 0);
      return totalBps === 10000;
    },
    { message: "Split percentages must sum to 100" }
  ),
});

invoicesRouter.post(
  "/:id/tip-splits",
  zValidator("json", tipSplitSchema),
  async (c) => {
    const db = getDb();
    const id = c.req.param("id");
    const body = c.req.valid("json");

    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id));
    if (!invoice) return c.json({ error: "Not found" }, 404);
    if (invoice.status === "void") return c.json({ error: "Cannot modify a voided invoice" }, 422);

    const tipCents = invoice.tipCents;

    await db.transaction(async (tx) => {
      // Remove existing splits
      await tx.delete(invoiceTipSplits).where(eq(invoiceTipSplits.invoiceId, id));

      // Insert new splits, distributing tipCents proportionally
      let remaining = tipCents;
      const rows = body.splits.map((s, i) => {
        const isLast = i === body.splits.length - 1;
        const shareCents = isLast ? remaining : Math.round((s.sharePct / 100) * tipCents);
        if (!isLast) remaining -= shareCents;
        return {
          invoiceId: id,
          staffId: s.staffId,
          staffName: s.staffName,
          sharePct: s.sharePct.toFixed(2),
          shareCents,
        };
      });

      if (rows.length > 0) {
        await tx.insert(invoiceTipSplits).values(rows);
      }
    });

    const [updatedInvoice] = await db.select().from(invoices).where(eq(invoices.id, id));
    const [lineItems, tipSplits] = await Promise.all([
      db.select().from(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, id)),
      db.select().from(invoiceTipSplits).where(eq(invoiceTipSplits.invoiceId, id)),
    ]);

    return c.json({ ...updatedInvoice, lineItems, tipSplits }, 201);
  }
);

// Create invoice (optionally pre-populated from an appointment)
invoicesRouter.post(
  "/",
  zValidator("json", createInvoiceSchema),
  async (c) => {
    const db = getDb();
    const body = c.req.valid("json");

    // If appointmentId provided, verify it exists
    if (body.appointmentId) {
      const [appt] = await db
        .select()
        .from(appointments)
        .where(eq(appointments.id, body.appointmentId));
      if (!appt) return c.json({ error: "Appointment not found" }, 404);
    }

    const subtotalCents = body.lineItems.reduce(
      (sum, item) => sum + item.quantity * item.unitPriceCents,
      0
    );
    const totalCents = subtotalCents + body.taxCents + body.tipCents;

    const [invoice] = await db
      .insert(invoices)
      .values({
        appointmentId: body.appointmentId ?? null,
        clientId: body.clientId,
        subtotalCents,
        taxCents: body.taxCents,
        tipCents: body.tipCents,
        totalCents,
        notes: body.notes ?? null,
      })
      .returning();

    if (!invoice) return c.json({ error: "Failed to create invoice" }, 500);

    const items = await db
      .insert(invoiceLineItems)
      .values(
        body.lineItems.map((item) => ({
          invoiceId: invoice.id,
          description: item.description,
          quantity: item.quantity,
          unitPriceCents: item.unitPriceCents,
          totalCents: item.quantity * item.unitPriceCents,
        }))
      )
      .returning();

    return c.json({ ...invoice, lineItems: items }, 201);
  }
);

// Create invoice from appointment (convenience endpoint)
invoicesRouter.post("/from-appointment/:appointmentId", async (c) => {
  const db = getDb();
  const appointmentId = c.req.param("appointmentId");

  const [appt] = await db
    .select({
      id: appointments.id,
      clientId: appointments.clientId,
      serviceId: appointments.serviceId,
      priceCents: appointments.priceCents,
      serviceName: services.name,
      serviceBasePriceCents: services.basePriceCents,
    })
    .from(appointments)
    .innerJoin(services, eq(appointments.serviceId, services.id))
    .where(eq(appointments.id, appointmentId));

  if (!appt) return c.json({ error: "Appointment not found" }, 404);

  // Check if invoice already exists for this appointment
  const [existing] = await db
    .select({ id: invoices.id })
    .from(invoices)
    .where(eq(invoices.appointmentId, appointmentId))
    .limit(1);

  if (existing) {
    return c.json(
      { error: "Invoice already exists for this appointment", invoiceId: existing.id },
      409
    );
  }

  const unitPriceCents = appt.priceCents ?? appt.serviceBasePriceCents;
  const subtotalCents = unitPriceCents;
  const totalCents = subtotalCents;

  const [invoice] = await db
    .insert(invoices)
    .values({
      appointmentId,
      clientId: appt.clientId,
      subtotalCents,
      taxCents: 0,
      tipCents: 0,
      totalCents,
    })
    .returning();

  if (!invoice) return c.json({ error: "Failed to create invoice" }, 500);

  const [lineItem] = await db
    .insert(invoiceLineItems)
    .values({
      invoiceId: invoice.id,
      description: appt.serviceName,
      quantity: 1,
      unitPriceCents,
      totalCents: unitPriceCents,
    })
    .returning();

  return c.json({ ...invoice, lineItems: [lineItem] }, 201);
});

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  draft: ["pending", "void"],
  pending: ["draft", "paid", "void"],
  paid: ["void"],
  void: [],
};

// Update invoice
invoicesRouter.patch(
  "/:id",
  zValidator("json", updateInvoiceSchema),
  async (c) => {
    const db = getDb();
    const id = c.req.param("id");
    const body = c.req.valid("json");

    const [current] = await db
      .select()
      .from(invoices)
      .where(eq(invoices.id, id));
    if (!current) return c.json({ error: "Not found" }, 404);

    if (body.status !== undefined) {
      const allowed = ALLOWED_TRANSITIONS[current.status] ?? [];
      if (!allowed.includes(body.status)) {
        return c.json(
          { error: `Invalid status transition from ${current.status} to ${body.status}` },
          422
        );
      }
    }

    // Validate and persist tip splits when marking invoice as paid
    if (body.status === "paid" && current.tipCents > 0) {
      // If incoming splits are provided in the request body, atomically replace them
      if (body.tipSplits !== undefined) {
        const totalPct = body.tipSplits.reduce((sum, s) => sum + s.sharePct, 0);
        if (Math.abs(totalPct - 100) > 0.01) {
          return c.json({ error: "Tip split percentages must sum to 100%" }, 400);
        }
        await db.transaction(async (tx) => {
          await tx.delete(invoiceTipSplits).where(eq(invoiceTipSplits.invoiceId, id));
          if (body.tipSplits.length > 0) {
            let remaining = current.tipCents;
            const rows = body.tipSplits.map((s, i) => {
              const isLast = i === body.tipSplits.length - 1;
              const shareCents = isLast ? remaining : Math.round((s.sharePct / 100) * current.tipCents);
              if (!isLast) remaining -= shareCents;
              return {
                invoiceId: id,
                staffId: s.staffId,
                staffName: s.staffName,
                sharePct: s.sharePct.toFixed(2),
                shareCents,
              };
            });
            await tx.insert(invoiceTipSplits).values(rows);
          }
        });
      } else {
        // No incoming splits — validate existing DB splits
        const splits = await db
          .select()
          .from(invoiceTipSplits)
          .where(eq(invoiceTipSplits.invoiceId, id));

        if (splits.length === 0) {
          return c.json(
            { error: "Tip splits are required when tip amount is greater than zero" },
            400
          );
        }

        const totalBps = splits.reduce((sum, s) => sum + Math.round(Number(s.sharePct) * 100), 0);
        if (totalBps !== 10000) {
          return c.json(
            { error: "Tip split percentages must sum to 100%" },
            400
          );
        }
      }
    }

    const update: Record<string, unknown> = { ...body, updatedAt: new Date() };

    // Auto-set paidAt when marking as paid
    if (body.status === "paid" && !body.paidAt && !current.paidAt) {
      update.paidAt = new Date();
    }

    // Recalculate total if tax or tip changed
    const newTaxCents = body.taxCents ?? current.taxCents;
    const newTipCents = body.tipCents ?? current.tipCents;
    if (body.taxCents !== undefined || body.tipCents !== undefined) {
      update.totalCents = current.subtotalCents + newTaxCents + newTipCents;
    }

    const [updated] = await db
      .update(invoices)
      .set(update)
      .where(eq(invoices.id, id))
      .returning();

    const lineItems = await db
      .select()
      .from(invoiceLineItems)
      .where(eq(invoiceLineItems.invoiceId, id));

    return c.json({ ...updated, lineItems });
  }
);

// ─── Refund ───────────────────────────────────────────────────────────────────

import { processRefund } from "../services/payment.js";

const refundSchema = z.object({
  amountCents: z.number().int().nonnegative().optional(),
  idempotencyKey: z.string().max(255).optional(),
});

invoicesRouter.post(
  "/:id/refund",
  zValidator("json", refundSchema),
  async (c) => {
    const db = getDb();
    const staff = c.get("staff");
    if (!staff) return c.json({ error: "Forbidden" }, 403);
    if (staff.role !== "manager" && !staff.isSuperUser) {
      return c.json({ error: "Manager role required" }, 403);
    }

    const id = c.req.param("id");
    const body = c.req.valid("json");

    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id));
    if (!invoice) return c.json({ error: "Not found" }, 404);
    if (invoice.status !== "paid") {
      return c.json({ error: "Refund only allowed on paid invoices" }, 422);
    }
    if (!invoice.stripePaymentIntentId) {
      return c.json({ error: "No Stripe payment intent found for this invoice" }, 422);
    }

    return await db.transaction(async (tx) => {
      if (body.idempotencyKey) {
        const [existing] = await tx
          .select()
          .from(refunds)
          .where(eq(refunds.idempotencyKey, body.idempotencyKey));
        if (existing) {
          return c.json({ refundId: existing.stripeRefundId });
        }
      }

      const result = await processRefund(id, body.amountCents);
      if (!result) return c.json({ error: "Refund failed" }, 500);

      await tx.insert(refunds).values({
        invoiceId: id,
        stripeRefundId: result.refundId,
        idempotencyKey: body.idempotencyKey ?? null,
        amountCents: body.amountCents ?? null,
      });

      return c.json({ refundId: result.refundId });
    });
  }
);
