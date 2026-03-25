import nodemailer from "nodemailer";
import type Mail from "nodemailer/lib/mailer/index.js";

// Returns null when SMTP is not configured — callers skip sending silently.
function createTransport(): nodemailer.Transporter | null {
  const host = process.env.SMTP_HOST;
  if (!host) return null;

  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth:
      process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
  });
}

let _transport: nodemailer.Transporter | null | undefined;

function getTransport(): nodemailer.Transporter | null {
  if (_transport === undefined) _transport = createTransport();
  return _transport;
}

const FROM = process.env.SMTP_FROM ?? "Groom Book <noreply@groombook.local>";

export async function sendEmail(opts: Mail.Options): Promise<boolean> {
  const transport = getTransport();
  if (!transport) return false; // SMTP not configured — skip silently

  await transport.sendMail({ from: FROM, ...opts });
  return true;
}

// ─── Email templates ──────────────────────────────────────────────────────────

interface AppointmentEmailData {
  clientName: string;
  petName: string;
  serviceName: string;
  groomerName: string | null;
  startTime: Date;
}

function formatDateTime(d: Date): string {
  return d.toLocaleString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function buildConfirmationEmail(
  to: string,
  data: AppointmentEmailData
): Mail.Options {
  const time = formatDateTime(data.startTime);
  const groomer = data.groomerName ? ` with ${data.groomerName}` : "";
  return {
    to,
    subject: `Appointment Confirmed — ${data.petName} on ${data.startTime.toLocaleDateString()}`,
    text: [
      `Hi ${data.clientName},`,
      ``,
      `Your appointment has been confirmed!`,
      ``,
      `  Pet:      ${data.petName}`,
      `  Service:  ${data.serviceName}`,
      `  When:     ${time}${groomer}`,
      ``,
      `We look forward to seeing you. If you need to reschedule, please contact us.`,
      ``,
      `— Groom Book`,
    ].join("\n"),
    html: `
<p>Hi ${data.clientName},</p>
<p>Your appointment has been confirmed!</p>
<table style="border-collapse:collapse;margin:1em 0">
  <tr><td style="padding:4px 12px 4px 0;font-weight:600;color:#6b7280">Pet</td><td>${data.petName}</td></tr>
  <tr><td style="padding:4px 12px 4px 0;font-weight:600;color:#6b7280">Service</td><td>${data.serviceName}</td></tr>
  <tr><td style="padding:4px 12px 4px 0;font-weight:600;color:#6b7280">When</td><td>${time}${groomer}</td></tr>
</table>
<p>We look forward to seeing you. If you need to reschedule, please contact us.</p>
<p>— Groom Book</p>`,
  };
}

export function buildReminderEmail(
  to: string,
  data: AppointmentEmailData,
  hoursAhead: number,
  confirmationToken?: string | null
): Mail.Options {
  const time = formatDateTime(data.startTime);
  const groomer = data.groomerName ? ` with ${data.groomerName}` : "";
  const when = hoursAhead >= 24 ? `tomorrow` : `in ${hoursAhead} hours`;
  const apiUrl = process.env.API_URL ?? "http://localhost:3000";

  const confirmUrl = confirmationToken ? `${apiUrl}/api/book/confirm/${confirmationToken}` : null;
  const cancelUrl = confirmationToken ? `${apiUrl}/api/book/cancel/${confirmationToken}` : null;

  const actionText = confirmationToken
    ? [
        ``,
        `Confirm your appointment: ${confirmUrl}`,
        `Cancel your appointment: ${cancelUrl}`,
      ].join("\n")
    : "";

  const actionHtml = confirmationToken
    ? `
<div style="margin:1.5em 0">
  <a href="${confirmUrl}" style="display:inline-block;padding:10px 20px;background:#10b981;color:#fff;text-decoration:none;border-radius:4px;font-weight:600;margin-right:12px">Confirm Appointment</a>
  <a href="${cancelUrl}" style="display:inline-block;padding:10px 20px;background:#fff;color:#ef4444;text-decoration:none;border-radius:4px;font-weight:600;border:1px solid #ef4444">Cancel Appointment</a>
</div>`
    : "";

  return {
    to,
    subject: `Reminder: ${data.petName}'s appointment is ${when}`,
    text: [
      `Hi ${data.clientName},`,
      ``,
      `Just a reminder that ${data.petName}'s grooming appointment is ${when}.`,
      ``,
      `  Pet:      ${data.petName}`,
      `  Service:  ${data.serviceName}`,
      `  When:     ${time}${groomer}`,
      actionText,
      `See you soon!`,
      ``,
      `— Groom Book`,
    ].join("\n"),
    html: `
<p>Hi ${data.clientName},</p>
<p>Just a reminder that <strong>${data.petName}</strong>'s grooming appointment is <strong>${when}</strong>.</p>
<table style="border-collapse:collapse;margin:1em 0">
  <tr><td style="padding:4px 12px 4px 0;font-weight:600;color:#6b7280">Pet</td><td>${data.petName}</td></tr>
  <tr><td style="padding:4px 12px 4px 0;font-weight:600;color:#6b7280">Service</td><td>${data.serviceName}</td></tr>
  <tr><td style="padding:4px 12px 4px 0;font-weight:600;color:#6b7280">When</td><td>${time}${groomer}</td></tr>
</table>
${actionHtml}
<p>See you soon!</p>
<p>— Groom Book</p>`,
  };
}

interface WaitlistNotificationData {
  clientName: string;
  petName: string;
  serviceName: string;
  preferredDate: string;
  preferredTime: string;
}

export function buildWaitlistNotificationEmail(
  to: string,
  data: WaitlistNotificationData
): Mail.Options {
  const apiUrl = process.env.API_URL ?? "http://localhost:3000";
  const bookUrl = `${apiUrl}/book`;
  return {
    to,
    subject: `Appointment Cancelled — A slot has opened up for ${data.petName}`,
    text: [
      `Hi ${data.clientName},`,
      ``,
      `Great news! An appointment slot has become available.`,
      ``,
      `We had a cancellation for:`,
      `  Pet:      ${data.petName}`,
      `  Service:  ${data.serviceName}`,
      `  Date:     ${data.preferredDate}`,
      `  Time:     ${data.preferredTime}`,
      ``,
      `If you're still interested, book now before this slot is taken!`,
      ``,
      `Book your appointment: ${bookUrl}`,
      ``,
      `— Groom Book`,
    ].join("\n"),
    html: `
<p>Hi ${data.clientName},</p>
<p>Great news! <strong>An appointment slot has become available</strong>.</p>
<p>We had a cancellation for:</p>
<table style="border-collapse:collapse;margin:1em 0">
  <tr><td style="padding:4px 12px 4px 0;font-weight:600;color:#6b7280">Pet</td><td>${data.petName}</td></tr>
  <tr><td style="padding:4px 12px 4px 0;font-weight:600;color:#6b7280">Service</td><td>${data.serviceName}</td></tr>
  <tr><td style="padding:4px 12px 4px 0;font-weight:600;color:#6b7280">Date</td><td>${data.preferredDate}</td></tr>
  <tr><td style="padding:4px 12px 4px 0;font-weight:600;color:#6b7280">Time</td><td>${data.preferredTime}</td></tr>
</table>
<div style="margin:1.5em 0">
  <a href="${bookUrl}" style="display:inline-block;padding:12px 24px;background:#10b981;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;font-size:16px">Book This Slot</a>
</div>
<p>If you're no longer interested, you can ignore this email or remove yourself from the waitlist in your portal.</p>
<p>— Groom Book</p>`,
  };
}
