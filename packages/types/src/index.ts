// Shared domain types for Groom Book

export type AppointmentStatus =
  | "scheduled"
  | "confirmed"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "no_show";

export type ConfirmationStatus = "pending" | "confirmed" | "cancelled";

export type ClientStatus = "active" | "disabled";

export interface Client {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  emailOptOut: boolean;
  status: ClientStatus;
  disabledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Pet {
  id: string;
  clientId: string;
  name: string;
  species: string;
  breed: string | null;
  weightKg: number | null;
  dateOfBirth: string | null;
  healthAlerts: string | null;
  groomingNotes: string | null;
  cutStyle: string | null;
  shampooPreference: string | null;
  specialCareNotes: string | null;
  customFields: Record<string, string>;
  photoKey?: string;
  photoUploadedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface GroomingVisitLog {
  id: string;
  petId: string;
  appointmentId: string | null;
  staffId: string | null;
  cutStyle: string | null;
  productsUsed: string | null;
  notes: string | null;
  groomedAt: string;
  createdAt: string;
}

export interface Service {
  id: string;
  name: string;
  description: string | null;
  basePriceCents: number;
  durationMinutes: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Staff {
  id: string;
  name: string;
  email: string;
  role: "groomer" | "receptionist" | "manager";
  isSuperUser: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RecurringSeries {
  id: string;
  frequencyWeeks: number;
  createdAt: string;
}

export interface AppointmentGroup {
  id: string;
  clientId: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Appointment {
  id: string;
  clientId: string;
  petId: string;
  serviceId: string;
  staffId: string | null;
  batherStaffId: string | null;
  status: AppointmentStatus;
  startTime: string;
  endTime: string;
  notes: string | null;
  priceCents: number | null;
  seriesId: string | null;
  seriesIndex: number | null;
  groupId: string | null;
  confirmationStatus: ConfirmationStatus;
  confirmedAt: string | null;
  cancelledAt: string | null;
  confirmationToken: string | null;
  customerNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceTipSplit {
  id: string;
  invoiceId: string;
  staffId: string | null;
  staffName: string;
  sharePct: string;
  shareCents: number;
  createdAt: string;
}

export type InvoiceStatus = "draft" | "pending" | "paid" | "void";
export type PaymentMethod = "cash" | "card" | "check" | "other";

export interface InvoiceLineItem {
  id: string;
  invoiceId: string;
  description: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
  createdAt: string;
}

export interface Invoice {
  id: string;
  appointmentId: string | null;
  clientId: string;
  subtotalCents: number;
  taxCents: number;
  tipCents: number;
  totalCents: number;
  status: InvoiceStatus;
  paymentMethod: PaymentMethod | null;
  paidAt: string | null;
  stripePaymentIntentId: string | null;
  stripeRefundId: string | null;
  paymentFailureReason: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  lineItems?: InvoiceLineItem[];
  // Transient fields populated from Stripe API (not stored in DB)
  cardLast4?: string | null;
  paymentStatus?: string | null;
  tipSplits?: InvoiceTipSplit[];
}

// ─── Impersonation ──────────────────────────────────────────────────────────

export type ImpersonationSessionStatus = "active" | "ended" | "expired";

export interface ImpersonationSession {
  id: string;
  staffId: string;
  clientId: string;
  reason: string | null;
  status: ImpersonationSessionStatus;
  startedAt: string;
  endedAt: string | null;
  expiresAt: string;
  createdAt: string;
}

export interface ImpersonationAuditLog {
  id: string;
  sessionId: string;
  action: string;
  pageVisited: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface BusinessSettings {
  id: string;
  businessName: string;
  logoBase64: string | null;
  logoMimeType: string | null;
  primaryColor: string;
  accentColor: string;
  createdAt: string;
  updatedAt: string;
}

// Paginated list response
export interface PaginatedList<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
