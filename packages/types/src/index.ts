// Shared domain types for Groom Book

export type AppointmentStatus =
  | "scheduled"
  | "confirmed"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "no_show";

export interface Client {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  emailOptOut: boolean;
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
  status: AppointmentStatus;
  startTime: string;
  endTime: string;
  notes: string | null;
  priceCents: number | null;
  seriesId: string | null;
  seriesIndex: number | null;
  groupId: string | null;
  createdAt: string;
  updatedAt: string;
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
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  lineItems?: InvoiceLineItem[];
}

// Paginated list response
export interface PaginatedList<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
