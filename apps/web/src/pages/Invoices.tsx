import { useEffect, useState, useRef } from "react";
import type { Invoice, Client, Appointment, Service, Staff, InvoiceTipSplit } from "@groombook/types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface InvoiceWithClient extends Invoice {
  clientName?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtMoney(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString();
}

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  draft: { bg: "#f3f4f6", color: "#6b7280" },
  pending: { bg: "#fef3c7", color: "#92400e" },
  paid: { bg: "#d1fae5", color: "#065f46" },
  void: { bg: "#fee2e2", color: "#991b1b" },
};

// ─── Invoice Status Badge ─────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const { bg, color } = STATUS_COLORS[status] ?? { bg: "#f3f4f6", color: "#374151" };
  return (
    <span
      style={{
        padding: "2px 8px",
        borderRadius: 12,
        fontSize: 11,
        fontWeight: 600,
        background: bg,
        color,
        textTransform: "uppercase",
      }}
    >
      {status}
    </span>
  );
}

// ─── Create Invoice Form ──────────────────────────────────────────────────────

interface CreateFromApptProps {
  appointments: Appointment[];
  clients: Client[];
  services: Service[];
  loading: boolean;
  onOpen: () => void;
  onCreated: () => void;
  onClose: () => void;
}

function CreateFromAppointmentForm({
  appointments,
  clients,
  services,
  loading,
  onOpen,
  onCreated,
  onClose,
}: CreateFromApptProps) {
  const [selectedApptId, setSelectedApptId] = useState("");
  useEffect(() => { onOpen(); }, [onOpen]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only show completed appointments without an invoice already
  const completedAppts = appointments.filter((a) => a.status === "completed");

  function getClientName(clientId: string) {
    return clients.find((c) => c.id === clientId)?.name ?? clientId;
  }

  function getServiceName(serviceId: string) {
    return services.find((s) => s.id === serviceId)?.name ?? serviceId;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedApptId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/invoices/from-appointment/${selectedApptId}`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      onCreated();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create invoice");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Modal onClose={onClose}><p style={{ padding: "1rem" }}>Loading…</p></Modal>;

  return (
    <Modal onClose={onClose}>
      <h2 style={{ marginTop: 0 }}>Create Invoice from Appointment</h2>
      <form onSubmit={submit}>
        <Field label="Select Appointment">
          <select
            value={selectedApptId}
            onChange={(e) => setSelectedApptId(e.target.value)}
            required
            style={inputStyle}
          >
            <option value="">— Choose a completed appointment —</option>
            {completedAppts.map((a) => (
              <option key={a.id} value={a.id}>
                {fmtDate(a.startTime)} · {getClientName(a.clientId)} · {getServiceName(a.serviceId)}
                {a.priceCents ? ` · ${fmtMoney(a.priceCents)}` : ""}
              </option>
            ))}
          </select>
        </Field>
        {completedAppts.length === 0 && (
          <p style={{ color: "#6b7280", fontSize: 13 }}>
            No completed appointments available. Mark an appointment as completed first.
          </p>
        )}
        {error && <p style={{ color: "red", margin: "0.5rem 0 0" }}>{error}</p>}
        <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
          <button
            type="submit"
            disabled={saving || !selectedApptId}
            style={{ ...btnStyle, backgroundColor: "var(--color-primary)", color: "#fff", borderColor: "var(--color-primary)" }}
          >
            {saving ? "Creating…" : "Create Invoice"}
          </button>
          <button type="button" onClick={onClose} style={btnStyle}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Invoice Detail Modal ─────────────────────────────────────────────────────

function InvoiceDetailModal({
  invoice,
  allStaff,
  allAppointments,
  loading,
  onOpen,
  onClose,
  onUpdated,
}: {
  invoice: Invoice;
  allStaff: Staff[];
  allAppointments: Appointment[];
  loading: boolean;
  onOpen: () => void;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [saving, setSaving] = useState(false);
  useEffect(() => { onOpen(); }, [onOpen]);
  const [error, setError] = useState<string | null>(null);
  const [tipStr, setTipStr] = useState((invoice.tipCents / 100).toFixed(2));
  const [paymentMethod, setPaymentMethod] = useState<string>(invoice.paymentMethod ?? "cash");
const [showRefundDialog, setShowRefundDialog] = useState(false);
  const [refundType, setRefundType] = useState<"full" | "partial">("full");
  const [refundAmount, setRefundAmount] = useState("");
  const [refundError, setRefundError] = useState<string | null>(null);
  const [refunding, setRefunding] = useState(false);

  // Fetch current staff role to determine manager access
  const [staffMe, setStaffMe] = useState<{ role: string; isSuperUser: boolean } | null>(null);
  useEffect(() => {
    fetch("/api/staff/me")
      .then((r) => r.json())
      .then((d) => setStaffMe(d))
      .catch(() => setStaffMe(null));
  }, []);
  const isManager = staffMe && (staffMe.role === "manager" || staffMe.isSuperUser);

  // Tip split state: array of {staffId, staffName, pct}
  const linkedAppt = invoice.appointmentId
    ? allAppointments.find((a) => a.id === invoice.appointmentId)
    : undefined;

  function buildDefaultSplits(): Array<{ staffId: string | null; staffName: string; pct: number }> {
    const groomer = linkedAppt?.staffId
      ? allStaff.find((s) => s.id === linkedAppt.staffId)
      : undefined;
    const bather = linkedAppt?.batherStaffId
      ? allStaff.find((s) => s.id === linkedAppt.batherStaffId)
      : undefined;
    if (!groomer) return [];
    if (bather) {
      return [
        { staffId: groomer.id, staffName: groomer.name, pct: 70 },
        { staffId: bather.id, staffName: bather.name, pct: 30 },
      ];
    }
    return [{ staffId: groomer.id, staffName: groomer.name, pct: 100 }];
  }

  const existingSplits = (invoice.tipSplits ?? []).map((s: InvoiceTipSplit) => ({
    staffId: s.staffId,
    staffName: s.staffName,
    pct: parseFloat(s.sharePct),
  }));

  const [tipSplits, setTipSplits] = useState<Array<{ staffId: string | null; staffName: string; pct: number }>>(
    existingSplits.length > 0 ? existingSplits : buildDefaultSplits()
  );
  const [showSplits, setShowSplits] = useState(tipSplits.length > 0);

  async function markPaid() {
    setSaving(true);
    setError(null);
    const tipCents = Math.round(parseFloat(tipStr) * 100) || 0;
    // Real-time validation: prevent submit if tip splits don't sum to 100%
    if (showSplits && tipCents > 0 && tipSplits.length > 0) {
      const totalPct = tipSplits.reduce((s, r) => s + r.pct, 0);
      if (Math.abs(totalPct - 100) >= 0.01) {
        setError("Tip split percentages must sum to 100%");
        setSaving(false);
        return;
      }
    }
    try {
      const patchBody: {
        status: string;
        paymentMethod: string;
        tipCents: number;
        tipSplits?: Array<{ staffId: string | null; staffName: string; sharePct: number }>;
      } = { status: "paid", paymentMethod, tipCents };

      if (showSplits && tipCents > 0 && tipSplits.length > 0) {
        patchBody.tipSplits = tipSplits.map((r) => ({
          staffId: r.staffId,
          staffName: r.staffName,
          sharePct: r.pct,
        }));
      }

      const res = await fetch(`/api/invoices/${invoice.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patchBody),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }

      onUpdated();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setSaving(false);
    }
  }

  async function voidInvoice() {
    if (!confirm("Void this invoice? This cannot be undone.")) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "void" }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      onUpdated();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to void");
    } finally {
      setSaving(false);
    }
  }

  async function issueRefund() {
    const amountCents = refundType === "partial"
      ? Math.round(parseFloat(refundAmount) * 100)
      : undefined;
    if (refundType === "partial" && (!amountCents || amountCents <= 0)) {
      setError("Enter a valid refund amount");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(amountCents ? { amountCents } : {}),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      setShowRefundDialog(false);
      onUpdated();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to issue refund");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Modal onClose={onClose}><p style={{ padding: "1rem" }}>Loading…</p></Modal>;

  const tipCentsCalc = Math.round(parseFloat(tipStr) * 100) || 0;
  const newTotal = invoice.subtotalCents + invoice.taxCents + tipCentsCalc;

  return (
    <Modal onClose={onClose}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
        <h2 style={{ margin: 0 }}>Invoice</h2>
        <StatusBadge status={invoice.status} />
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, marginBottom: "1rem" }}>
        <thead>
          <tr style={{ background: "#f8fafc" }}>
            {["Description", "Qty", "Unit Price", "Total"].map((h) => (
              <th key={h} style={{ textAlign: "left", padding: "0.4rem 0.5rem", borderBottom: "1px solid #e2e8f0" }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(invoice.lineItems ?? []).map((item) => (
            <tr key={item.id}>
              <td style={tdStyle}>{item.description}</td>
              <td style={tdStyle}>{item.quantity}</td>
              <td style={tdStyle}>{fmtMoney(item.unitPriceCents)}</td>
              <td style={tdStyle}>{fmtMoney(item.totalCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: "0.75rem", fontSize: 14 }}>
        <SummaryRow label="Subtotal" value={fmtMoney(invoice.subtotalCents)} />
        <SummaryRow label="Tax" value={fmtMoney(invoice.taxCents)} />
        {invoice.status !== "paid" && invoice.status !== "void" ? (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.25rem 0" }}>
            <span style={{ color: "#6b7280" }}>Tip</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={tipStr}
              onChange={(e) => setTipStr(e.target.value)}
              style={{ ...inputStyle, width: 80, textAlign: "right" }}
            />
          </div>
        ) : (
          <SummaryRow label="Tip" value={fmtMoney(invoice.tipCents)} />
        )}
        <SummaryRow
          label="Total"
          value={fmtMoney(invoice.status !== "paid" && invoice.status !== "void" ? newTotal : invoice.totalCents)}
          bold
        />
        {invoice.paidAt && <SummaryRow label="Paid on" value={fmtDate(invoice.paidAt)} />}
        {invoice.paymentMethod && <SummaryRow label="Payment" value={invoice.paymentMethod} />}
        {invoice.stripePaymentIntentId && (
          <>
            {invoice.cardLast4 && (
              <SummaryRow label="Card" value={`•••• ${invoice.cardLast4}`} />
            )}
            {invoice.paymentStatus && (
              <SummaryRow label="Stripe status" value={invoice.paymentStatus} />
            )}
            {invoice.stripeRefundId && (
              <SummaryRow label="Refund" value="Refunded" />
            )}
          </>
        )}
      </div>

      {/* ── Tip Distribution ── */}
      {invoice.status !== "void" && (
        <div style={{ marginTop: "0.75rem", borderTop: "1px solid #e2e8f0", paddingTop: "0.75rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>Tip Distribution</span>
            {invoice.status !== "paid" && (
              <button
                onClick={() => setShowSplits((v) => !v)}
                style={{ ...btnStyle, fontSize: 12 }}
              >
                {showSplits ? "Hide" : "Set up"}
              </button>
            )}
          </div>

          {/* Show existing splits on paid invoices */}
          {invoice.status === "paid" && (invoice.tipSplits ?? []).length > 0 && (
            <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
              <tbody>
                {(invoice.tipSplits ?? []).map((s: InvoiceTipSplit) => (
                  <tr key={s.id}>
                    <td style={{ padding: "2px 0", color: "#374151" }}>{s.staffName}</td>
                    <td style={{ padding: "2px 0", color: "#6b7280", textAlign: "right" }}>{parseFloat(s.sharePct).toFixed(0)}%</td>
                    <td style={{ padding: "2px 0", textAlign: "right", fontWeight: 600 }}>{fmtMoney(s.shareCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {invoice.status === "paid" && (invoice.tipSplits ?? []).length === 0 && (
            <p style={{ fontSize: 12, color: "#9ca3af", margin: 0 }}>No split recorded.</p>
          )}

          {/* Editable splits before payment */}
          {invoice.status !== "paid" && showSplits && (
            <div>
              {tipSplits.map((row, idx) => {
                const splitTipCents = Math.round((row.pct / 100) * (Math.round(parseFloat(tipStr) * 100) || 0));
                return (
                  <div key={idx} style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.35rem", fontSize: 13 }}>
                    <input
                      value={row.staffName}
                      onChange={(e) => setTipSplits((prev) => prev.map((r, i) => i === idx ? { ...r, staffName: e.target.value } : r))}
                      style={{ ...inputStyle, flex: 1 }}
                      placeholder="Name"
                    />
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      value={row.pct}
                      onChange={(e) => setTipSplits((prev) => prev.map((r, i) => i === idx ? { ...r, pct: Number(e.target.value) } : r))}
                      style={{ ...inputStyle, width: 60, textAlign: "right" }}
                    />
                    <span style={{ color: "#6b7280" }}>%</span>
                    <span style={{ minWidth: 60, textAlign: "right", color: "#374151" }}>{fmtMoney(splitTipCents)}</span>
                    <button
                      onClick={() => setTipSplits((prev) => prev.filter((_, i) => i !== idx))}
                      style={{ ...btnStyle, color: "#dc2626", borderColor: "#dc2626", padding: "0.2rem 0.4rem" }}
                    >×</button>
                  </div>
                );
              })}
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.25rem" }}>
                <button
                  onClick={() => setTipSplits((prev) => [...prev, { staffId: null, staffName: "", pct: 0 }])}
                  style={{ ...btnStyle, fontSize: 12 }}
                >
                  + Add person
                </button>
                {(() => {
                  const total = tipSplits.reduce((s, r) => s + r.pct, 0);
                  const ok = Math.abs(total - 100) < 0.01;
                  return <span style={{ fontSize: 12, color: ok ? "#10b981" : "#ef4444" }}>Total: {total.toFixed(0)}%{ok ? " ✓" : " (must be 100%)"}</span>;
                })()}
              </div>
            </div>
          )}
        </div>
      )}

      {invoice.status !== "paid" && invoice.status !== "void" && (
        <div style={{ marginTop: "1rem", borderTop: "1px solid #e2e8f0", paddingTop: "1rem" }}>
          <Field label="Payment Method">
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              style={inputStyle}
            >
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="check">Check</option>
              <option value="other">Other</option>
            </select>
          </Field>
          {error && <p style={{ color: "red", margin: "0.5rem 0 0" }}>{error}</p>}
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
            <button
              onClick={markPaid}
              disabled={saving}
              style={{ ...btnStyle, backgroundColor: "#10b981", color: "#fff", borderColor: "#10b981" }}
            >
              {saving ? "Saving…" : "Mark as Paid"}
            </button>
            <button onClick={voidInvoice} disabled={saving} style={{ ...btnStyle, color: "#dc2626", borderColor: "#dc2626" }}>
              Void
            </button>
            <button onClick={onClose} style={btnStyle}>
              Close
            </button>
          </div>
        </div>
      )}
      {(invoice.status === "paid" || invoice.status === "void") && (
        <div style={{ marginTop: "1rem", borderTop: "1px solid #e2e8f0", paddingTop: "1rem" }}>
          {invoice.stripeRefundId && (
            <div style={{ marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span style={{ background: "#fef3c7", color: "#92400e", padding: "0.2rem 0.6rem", borderRadius: 4, fontSize: 13, fontWeight: 600 }}>Refunded</span>
            </div>
          )}
          <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
            {invoice.status === "paid" && invoice.stripePaymentIntentId && !invoice.stripeRefundId && isManager && (
              <button onClick={() => setShowRefundDialog(true)} style={{ ...btnStyle, color: "#fff", backgroundColor: "#7c3aed", borderColor: "#7c3aed" }}>
                Refund
              </button>
            )}
            <button onClick={onClose} style={btnStyle}>Close</button>
          </div>
        </div>
      )}

      {showRefundDialog && (
        <div style={{ marginTop: "1rem", border: "1px solid #e2e8f0", borderRadius: 8, padding: "1rem", background: "#f9fafb" }}>
          <p style={{ fontWeight: 600, margin: "0 0 0.75rem" }}>Process Refund</p>
          <div style={{ display: "flex", gap: "0.75rem", marginBottom: "0.75rem" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "0.25rem", cursor: "pointer" }}>
              <input type="radio" checked={refundType === "full"} onChange={() => setRefundType("full")} />
              Full refund
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "0.25rem", cursor: "pointer" }}>
              <input type="radio" checked={refundType === "partial"} onChange={() => setRefundType("partial")} />
              Partial refund
            </label>
          </div>
          {refundType === "partial" && (
            <div style={{ marginBottom: "0.75rem" }}>
              <input
                type="number"
                min="0.01"
                step="0.01"
                placeholder="Amount ($)"
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
                style={{ ...inputStyle, width: 100 }}
              />
            </div>
          )}
          {refundError && <p style={{ color: "red", margin: "0 0 0.5rem", fontSize: 13 }}>{refundError}</p>}
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              onClick={async () => {
                setRefunding(true);
                setRefundError(null);
                try {
                  const body = refundType === "partial" ? { amountCents: Math.round(parseFloat(refundAmount) * 100) } : {};
                  const res = await fetch(`/api/invoices/${invoice.id}/refund`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                  });
                  if (!res.ok) {
                    const err = (await res.json()) as { error?: string };
                    throw new Error(err.error ?? `HTTP ${res.status}`);
                  }
                  setShowRefundDialog(false);
                  onUpdated();
                } catch (e: unknown) {
                  setRefundError(e instanceof Error ? e.message : "Refund failed");
                } finally {
                  setRefunding(false);
                }
              }}
              disabled={refunding}
              style={{ ...btnStyle, color: "#fff", backgroundColor: "#7c3aed", borderColor: "#7c3aed" }}
            >
              {refunding ? "Processing…" : "Process Refund"}
            </button>
            <button onClick={() => { setShowRefundDialog(false); setRefundError(null); }} style={btnStyle}>Cancel</button>
          </div>
        </div>
      )}

          </Modal>
  );
}

function SummaryRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "0.25rem 0",
        fontWeight: bold ? 700 : 400,
        fontSize: bold ? 15 : 14,
      }}
    >
      <span style={{ color: bold ? "#111827" : "#6b7280" }}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

interface PaginatedResponse<T> {
  data: T[];
  total: number;
}

export function InvoicesPage() {
  const [invoiceList, setInvoiceList] = useState<InvoiceWithClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [createData, setCreateData] = useState<{ clients: Client[]; appointments: Appointment[]; services: Service[] } | null>(null);
  const [createLoading, setCreateLoading] = useState(false);
  const [detailData, setDetailData] = useState<{ staff: Staff[]; appointments: Appointment[] } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [paymentStats, setPaymentStats] = useState<{ revenueThisMonth: number; outstanding: number; refundsThisMonth: number; methodBreakdown: { method: string | null; total: number }[] } | null>(null);

  const LIMIT = 50;

  useEffect(() => {
    fetch("/api/invoices/stats/summary")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data) setPaymentStats(data); })
      .catch(() => {});
  }, []);

  async function loadInvoices(newOffset: number) {
    const params = new URLSearchParams({ limit: String(LIMIT), offset: String(newOffset) });
    if (statusFilter) params.set("status", statusFilter);
    const res = await fetch(`/api/invoices?${params}`);
    if (!res.ok) throw new Error("Failed to load invoices");
    const page = (await res.json()) as PaginatedResponse<Invoice>;
    setInvoiceList(page.data);
    setTotal(page.total);
    setOffset(newOffset);
  }

  useEffect(() => {
    setLoading(true);
    loadInvoices(0)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Unknown error"))
      .finally(() => setLoading(false));
  }, [statusFilter]);

  function loadCreateData() {
    if (createData) return Promise.resolve();
    setCreateLoading(true);
    return Promise.all([
      fetch("/api/clients"),
      fetch("/api/appointments"),
      fetch("/api/services?includeInactive=true"),
    ])
      .then(([c, a, s]) => Promise.all([c.json(), a.json(), s.json()]))
      .then(([clients, appointments, services]) => {
        setCreateData({ clients, appointments, services });
      })
      .finally(() => setCreateLoading(false));
  }

  function loadDetailData() {
    if (detailData) return Promise.resolve();
    setDetailLoading(true);
    return Promise.all([fetch("/api/staff"), fetch("/api/appointments")])
      .then(([s, a]) => Promise.all([s.json(), a.json()]))
      .then(([staff, appointments]) => {
        setDetailData({ staff, appointments });
      })
      .finally(() => setDetailLoading(false));
  }

  async function openInvoiceDetail(inv: InvoiceWithClient) {
    const res = await fetch(`/api/invoices/${inv.id}`);
    if (!res.ok) return;
    const data = (await res.json()) as Invoice;
    setSelectedInvoice(data);
    loadDetailData();
  }

  if (loading) return <p style={{ padding: "1rem" }}>Loading…</p>;
  if (error) return <p style={{ padding: "1rem", color: "red" }}>Error: {error}</p>;

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1rem" }}>
        <h1 style={{ margin: 0 }}>Invoices</h1>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ ...inputStyle, width: "auto" }}
        >
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="pending">Pending</option>
          <option value="paid">Paid</option>
          <option value="void">Void</option>
        </select>
        <button
          onClick={() => setShowCreate(true)}
          style={{ ...btnStyle, backgroundColor: "var(--color-primary)", color: "#fff", borderColor: "var(--color-primary)", marginLeft: "auto" }}
        >
          + Create Invoice
        </button>
      </div>

      {/* Payment Stats Summary */}
      {paymentStats && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.75rem", marginBottom: "1.25rem" }}>
          <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "0.75rem 1rem" }}>
            <div style={{ fontSize: 12, color: "#166534", fontWeight: 600, marginBottom: "0.25rem" }}>Revenue (paid)</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#15803d" }}>{fmtMoney(paymentStats.revenueThisMonth)}</div>
          </div>
          <div style={{ background: "#fefce8", border: "1px solid #fde047", borderRadius: 8, padding: "0.75rem 1rem" }}>
            <div style={{ fontSize: 12, color: "#854d0e", fontWeight: 600, marginBottom: "0.25rem" }}>Outstanding</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#a16207" }}>{fmtMoney(paymentStats.outstanding)}</div>
          </div>
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "0.75rem 1rem" }}>
            <div style={{ fontSize: 12, color: "#991b1b", fontWeight: 600, marginBottom: "0.25rem" }}>Refunds (this mo.)</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#dc2626" }}>{fmtMoney(paymentStats.refundsThisMonth)}</div>
          </div>
          {paymentStats.methodBreakdown.length > 0 && (
            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "0.75rem 1rem" }}>
              <div style={{ fontSize: 12, color: "#475569", fontWeight: 600, marginBottom: "0.25rem" }}>By method</div>
              <div style={{ fontSize: 13, color: "#64748b" }}>
                {paymentStats.methodBreakdown.map((b) => (
                  <div key={b.method ?? "unknown"}>{b.method ?? "other"}: {b.total}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {invoiceList.length === 0 ? (
        <p style={{ color: "#6b7280" }}>
          No invoices yet. Create one from a completed appointment.
        </p>
      ) : (
        <>
        <div style={{ background: "#fff", borderRadius: 8, border: "1px solid #e5e7eb", overflow: "hidden", boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ background: "#f8fafc" }}>
              {["Date", "Client", "Subtotal", "Tax", "Tip", "Total", "Status", ""].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "0.55rem 0.75rem", borderBottom: "1px solid #e5e7eb", fontSize: 11, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {invoiceList.map((inv) => (
              <tr key={inv.id} style={{ opacity: inv.status === "void" ? 0.5 : 1 }}>
                <td style={tdStyle}>{fmtDate(inv.createdAt)}</td>
                <td style={tdStyle}>{inv.clientName ?? "—"}</td>
                <td style={tdStyle}>{fmtMoney(inv.subtotalCents)}</td>
                <td style={tdStyle}>{fmtMoney(inv.taxCents)}</td>
                <td style={tdStyle}>{fmtMoney(inv.tipCents)}</td>
                <td style={{ ...tdStyle, fontWeight: 600 }}>{fmtMoney(inv.totalCents)}</td>
                <td style={tdStyle}>
                  <StatusBadge status={inv.status} />
                </td>
                <td style={tdStyle}>
                  <button onClick={() => openInvoiceDetail(inv)} style={btnStyle}>
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "0.75rem" }}>
          <span style={{ fontSize: 13, color: "#6b7280" }}>
            {offset + 1}–{Math.min(offset + LIMIT, total)} of {total} invoices
          </span>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              onClick={() => { setLoading(true); loadInvoices(Math.max(0, offset - LIMIT)).finally(() => setLoading(false)); }}
              disabled={offset === 0 || loading}
              style={btnStyle}
            >
              Previous
            </button>
            <button
              onClick={() => { setLoading(true); loadInvoices(offset + LIMIT).finally(() => setLoading(false)); }}
              disabled={offset + LIMIT >= total || loading}
              style={btnStyle}
            >
              Next
            </button>
          </div>
        </div>
        </>
      )}

      {showCreate && (
        <CreateFromAppointmentForm
          appointments={createData?.appointments ?? []}
          clients={createData?.clients ?? []}
          services={createData?.services ?? []}
          loading={createLoading}
          onOpen={() => loadCreateData()}
          onCreated={() => {
            setShowCreate(false);
            setCreateData(null);
            loadInvoices(0).catch(() => {});
          }}
          onClose={() => setShowCreate(false)}
        />
      )}

      {selectedInvoice && (
        <InvoiceDetailModal
          invoice={selectedInvoice}
          allStaff={detailData?.staff ?? []}
          allAppointments={detailData?.appointments ?? []}
          loading={detailLoading}
          onOpen={() => loadDetailData()}
          onClose={() => {
            setSelectedInvoice(null);
            setDetailData(null);
          }}
          onUpdated={() => {
            setSelectedInvoice(null);
            setDetailData(null);
            loadInvoices(offset).catch(() => {});
          }}
        />
      )}
    </div>
  );
}

// ─── Shared UI helpers ────────────────────────────────────────────────────────

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement;
    const focusableSelectors = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const focusableElements = modalRef.current?.querySelectorAll<HTMLElement>(focusableSelectors);
    const firstFocusable = focusableElements?.[0];
    firstFocusable?.focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      if (!modalRef.current) return;
      const focusables = modalRef.current.querySelectorAll<HTMLElement>(focusableSelectors);
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={modalRef}
        style={{
          background: "#fff", borderRadius: 8, padding: "1.5rem",
          maxWidth: 520, width: "calc(100% - 2rem)", maxHeight: "90vh", overflowY: "auto",
          boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "0.75rem" }}>
      <label style={{ display: "block", fontWeight: 600, marginBottom: "0.25rem", fontSize: 13, color: "#374151" }}>
        {label}
      </label>
      {children}
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: "0.4rem 0.85rem", border: "1px solid #d1d5db",
  borderRadius: 6, background: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 500,
};

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "0.45rem 0.6rem", border: "1px solid #d1d5db",
  borderRadius: 6, fontSize: 14, boxSizing: "border-box",
};

const tdStyle: React.CSSProperties = {
  padding: "0.55rem 0.75rem", borderBottom: "1px solid #f3f4f6",
};
