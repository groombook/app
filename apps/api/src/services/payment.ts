import Stripe from "stripe";
import { getDb, clients, eq, invoices } from "@groombook/db";

let _stripe: Stripe | null | undefined;

function getStripeClient(): Stripe | null {
  if (_stripe === undefined) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) return null;
    _stripe = new Stripe(secretKey);
  }
  return _stripe;
}

export async function getOrCreateStripeCustomer(clientId: string): Promise<string | null> {
  const stripe = getStripeClient();
  if (!stripe) return null;

  const db = getDb();
  const [client] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
  if (!client) return null;

  if (client.stripeCustomerId) return client.stripeCustomerId;

  const customer = await stripe.customers.create({
    metadata: { groombook_client_id: clientId },
  });

  await db
    .update(clients)
    .set({ stripeCustomerId: customer.id, updatedAt: new Date() })
    .where(eq(clients.id, clientId));

  return customer.id;
}

export async function createPaymentIntent(
  invoiceIdOrIds: string | string[],
  clientId: string
): Promise<{ clientSecret: string; paymentIntentId: string } | null> {
  const stripe = getStripeClient();
  if (!stripe) return null;

  const db = getDb();
  const invoiceIds = Array.isArray(invoiceIdOrIds) ? invoiceIdOrIds : [invoiceIdOrIds];

  const invoiceRows = await db
    .select()
    .from(invoices)
    .where(eq(invoices.id, invoiceIds[0]));

  const [invoice] = invoiceRows;
  if (!invoice) return null;

  let totalCents = invoice.totalCents;
  if (invoiceIds.length > 1) {
    const allInvoices = await db
      .select({ totalCents: invoices.totalCents })
      .from(invoices)
      .where(eq(invoices.id, invoiceIds[0]));
    totalCents = allInvoices.reduce((sum, inv) => sum + inv.totalCents, totalCents);
  }

  const stripeCustomerId = await getOrCreateStripeCustomer(clientId);
  if (!stripeCustomerId) return null;

  const paymentIntent = await stripe.paymentIntents.create({
    amount: totalCents,
    currency: "usd",
    customer: stripeCustomerId,
    metadata: {
      groombook_invoice_ids: invoiceIds.join(","),
      groombook_client_id: clientId,
    },
    automatic_payment_methods: { enabled: true },
  });

  for (const invId of invoiceIds) {
    await db
      .update(invoices)
      .set({ stripePaymentIntentId: paymentIntent.id, updatedAt: new Date() })
      .where(eq(invoices.id, invId));
  }

  return {
    clientSecret: paymentIntent.client_secret!,
    paymentIntentId: paymentIntent.id,
  };
}

export async function processRefund(
  invoiceId: string,
  amountCents?: number
): Promise<{ refundId: string } | null> {
  const stripe = getStripeClient();
  if (!stripe) return null;

  const db = getDb();
  const [invoice] = await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
  if (!invoice?.stripePaymentIntentId) return null;

  const refund = await stripe.refunds.create({
    payment_intent: invoice.stripePaymentIntentId,
    amount: amountCents,
  });

  await db
    .update(invoices)
    .set({ stripeRefundId: refund.id, updatedAt: new Date() })
    .where(eq(invoices.id, invoiceId));

  return { refundId: refund.id };
}

export async function listPaymentMethods(clientId: string): Promise<Stripe.PaymentMethod[] | null> {
  const stripe = getStripeClient();
  if (!stripe) return null;

  const stripeCustomerId = await getOrCreateStripeCustomer(clientId);
  if (!stripeCustomerId) return null;

  const methods = await stripe.paymentMethods.list({
    customer: stripeCustomerId,
    type: "card",
  });

  return methods.data;
}

export async function attachPaymentMethod(
  clientId: string,
  paymentMethodId: string
): Promise<boolean> {
  const stripe = getStripeClient();
  if (!stripe) return false;

  const stripeCustomerId = await getOrCreateStripeCustomer(clientId);
  if (!stripeCustomerId) return false;

  await stripe.paymentMethods.attach(paymentMethodId, { customer: stripeCustomerId });
  return true;
}

export async function detachPaymentMethod(paymentMethodId: string): Promise<boolean> {
  const stripe = getStripeClient();
  if (!stripe) return false;

  await stripe.paymentMethods.detach(paymentMethodId);
  return true;
}
