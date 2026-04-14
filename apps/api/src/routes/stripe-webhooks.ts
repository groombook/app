import { Hono } from "hono";
import Stripe from "stripe";
import { z } from "zod/v3";
import { eq, getDb, invoices } from "@groombook/db";
import { getStripeClient } from "../services/payment.js";

export const webhooksRouter = new Hono();

webhooksRouter.post("/stripe", async (c) => {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return c.json({ error: "Webhook secret not configured" }, 503);
  }

  const signature = c.req.header("stripe-signature");
  if (!signature) {
    return c.json({ error: "Missing signature" }, 401);
  }

  let rawBody: string;
  try {
    rawBody = await c.req.text();
  } catch {
    return c.json({ error: "Could not read body" }, 400);
  }

  const stripe = getStripeClient();
  if (!stripe) {
    return c.json({ error: "Stripe not configured" }, 503);
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    return c.json({ error: message }, 401);
  }

  const db = getDb();

  if (event.type === "payment_intent.succeeded") {
    const pi = event.data.object as Stripe.PaymentIntent;
    if (pi.metadata?.groombook_invoice_ids) {
      const invoiceIds = pi.metadata.groombook_invoice_ids.split(",");
      for (const invoiceId of invoiceIds) {
        if (!invoiceId) continue;
        const parsed = z.string().uuid().safeParse(invoiceId.trim());
        if (!parsed.success) continue;
        const invoiceIdTrimmed = invoiceId.trim();
        const [inv] = await db
          .select()
          .from(invoices)
          .where(eq(invoices.id, invoiceIdTrimmed))
          .limit(1);
        if (!inv) continue;
        if (inv.stripePaymentIntentId && inv.stripePaymentIntentId !== pi.id) continue;
        await db
          .update(invoices)
          .set({
            status: "paid",
            paymentMethod: "card",
            paidAt: new Date(),
            stripePaymentIntentId: pi.id,
            updatedAt: new Date(),
          })
          .where(eq(invoices.id, invoiceIdTrimmed));
      }
    }
  } else if (event.type === "payment_intent.payment_failed") {
    const pi = event.data.object as Stripe.PaymentIntent;
    if (pi.metadata?.groombook_invoice_ids) {
      const invoiceIds = pi.metadata.groombook_invoice_ids.split(",");
      for (const invoiceId of invoiceIds) {
        if (!invoiceId) continue;
        const parsed = z.string().uuid().safeParse(invoiceId.trim());
        if (!parsed.success) continue;
        const invoiceIdTrimmed = invoiceId.trim();
        await db
          .update(invoices)
          .set({
            paymentFailureReason: pi.last_payment_error?.message ?? "Payment failed",
            updatedAt: new Date(),
          })
          .where(eq(invoices.id, invoiceIdTrimmed));
      }
    }
  } else if (event.type === "charge.refunded") {
    const charge = event.data.object as Stripe.Charge;
    if (typeof charge.payment_intent === "string" && charge.payment_intent) {
      const [inv] = await db
        .select({ id: invoices.id })
        .from(invoices)
        .where(eq(invoices.stripePaymentIntentId, charge.payment_intent))
        .limit(1);
      if (inv) {
        const refundId =
          typeof charge.refunded === "boolean" && charge.refunded
            ? `ch_${charge.id}_refund`
            : null;
        await db
          .update(invoices)
          .set({
            status: "void",
            stripeRefundId: refundId,
            updatedAt: new Date(),
          })
          .where(eq(invoices.id, inv.id));
      }
    }
  } else if (event.type === "charge.dispute.created") {
    const dispute = event.data.object as Stripe.Dispute;
    console.error(
      `[Stripe Webhook] Dispute created for payment intent: ${dispute.payment_intent}`
    );
  }

  return c.json({ received: true });
});
