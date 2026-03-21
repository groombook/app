import { useEffect, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Summary {
  from: string;
  to: string;
  revenue: { totalCents: number; paidInvoices: number };
  appointments: { total: number; completed: number; cancelled: number; noShow: number };
  clients: { total: number; new: number };
}

interface RevenuePeriod {
  period: string;
  totalCents: number;
  invoiceCount: number;
}

interface RevenueByGroomer {
  staffId: string;
  staffName: string;
  totalCents: number;
  invoiceCount: number;
}

interface RevenueReport {
  byPeriod: RevenuePeriod[];
  byGroomer: RevenueByGroomer[];
}

interface ApptPeriod {
  period: string;
  total: number;
  completed: number;
  cancelled: number;
  noShow: number;
}

interface ServiceRow {
  serviceId: string;
  serviceName: string;
  appointmentCount: number;
  completedCount: number;
  revenueCents: number;
}

interface ChurnClient {
  clientId: string;
  clientName: string;
  lastAppointmentAt: string | null;
}

interface ClientReport {
  newClients: { clientId: string; clientName: string; createdAt: string }[];
  activeInPeriodCount: number;
  churnRisk: ChurnClient[];
  churnRiskTotal: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtMoney(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function fmtDate(iso: string | null) {
  if (!iso) return "Never";
  return new Date(iso).toLocaleDateString();
}

function toInputDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function buildQuery(from: string, to: string, extra: Record<string, string> = {}) {
  const params = new URLSearchParams({ from: `${from}T00:00:00Z`, to: `${to}T23:59:59Z`, ...extra });
  return params.toString();
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 10,
        padding: "1rem 1.25rem",
        flex: 1,
        minWidth: 140,
        boxShadow: "0 1px 3px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04)",
      }}
    >
      <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, margin: "0.25rem 0", color: "#111827" }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "#9ca3af" }}>{sub}</div>}
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ fontSize: 15, fontWeight: 700, margin: "1.75rem 0 0.75rem", color: "#1a202c", borderBottom: "2px solid #e5e7eb", paddingBottom: "0.5rem" }}>
      {children}
    </h2>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: (string | number)[][] }) {
  return (
    <div style={{ background: "#fff", borderRadius: 8, border: "1px solid #e5e7eb", overflow: "hidden", boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ background: "#f8fafc" }}>
            {headers.map((h) => (
              <th key={h} style={{ textAlign: "left", padding: "0.5rem 0.75rem", borderBottom: "1px solid #e5e7eb", fontWeight: 600, fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
              {row.map((cell, j) => (
                <td key={j} style={{ padding: "0.5rem 0.75rem", color: "#374151" }}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={headers.length} style={{ padding: "1.5rem 0.75rem", color: "#9ca3af", textAlign: "center" }}>
                No data for this period.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function ReportsPage() {
  const today = new Date();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(today.getDate() - 30);

  const [fromDate, setFromDate] = useState(toInputDate(thirtyDaysAgo));
  const [toDate, setToDate] = useState(toInputDate(today));
  const [groupBy, setGroupBy] = useState<"day" | "week" | "month">("day");

  const [summary, setSummary] = useState<Summary | null>(null);
  const [revenue, setRevenue] = useState<RevenueReport | null>(null);
  const [apptTrends, setApptTrends] = useState<ApptPeriod[]>([]);
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [clientReport, setClientReport] = useState<ClientReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const qs = buildQuery(fromDate, toDate);
      const qsGroup = buildQuery(fromDate, toDate, { groupBy });

      const [summRes, revRes, apptRes, svcRes, clientRes] = await Promise.all([
        fetch(`/api/reports/summary?${qs}`),
        fetch(`/api/reports/revenue?${qsGroup}`),
        fetch(`/api/reports/appointments?${qsGroup}`),
        fetch(`/api/reports/services?${qs}`),
        fetch(`/api/reports/clients?${qs}`),
      ]);

      const failures = [
        ["summary", summRes],
        ["revenue", revRes],
        ["appointments", apptRes],
        ["services", svcRes],
        ["clients", clientRes],
      ].filter(([, r]) => !(r as Response).ok);
      if (failures.length > 0) {
        const details = await Promise.all(
          failures.map(async ([name, r]) => {
            const res = r as Response;
            let body = "";
            try { body = await res.text(); } catch { /* ignore */ }
            return `${name} (HTTP ${res.status}${body ? `: ${body.slice(0, 120)}` : ""})`;
          })
        );
        throw new Error(`Failed to load report data — ${details.join(", ")}`);
      }

      const [summData, revData, apptData, svcData, clientData] = await Promise.all([
        summRes.json() as Promise<Summary>,
        revRes.json() as Promise<{ byPeriod: RevenuePeriod[]; byGroomer: RevenueByGroomer[] }>,
        apptRes.json() as Promise<{ byPeriod: ApptPeriod[] }>,
        svcRes.json() as Promise<{ rows: ServiceRow[] }>,
        clientRes.json() as Promise<ClientReport>,
      ]);

      setSummary(summData);
      setRevenue(revData);
      setApptTrends(apptData.byPeriod);
      setServices(svcData.rows);
      setClientReport(clientData);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAll(); }, []); // run on mount only

  function exportCsv(type: "revenue" | "appointments" | "services") {
    const qs = buildQuery(fromDate, toDate, { type });
    window.open(`/api/reports/export.csv?${qs}`, "_blank");
  }

  const completionRate =
    summary && summary.appointments.total > 0
      ? Math.round((summary.appointments.completed / summary.appointments.total) * 100)
      : 0;

  const noShowRate =
    summary && summary.appointments.total > 0
      ? Math.round((summary.appointments.noShow / summary.appointments.total) * 100)
      : 0;

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", maxWidth: 900 }}>
      {/* ── Controls ── */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1.25rem" }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Reports</h1>
        <label style={{ fontSize: 13, color: "#374151" }}>
          From{" "}
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            style={inputStyle}
          />
        </label>
        <label style={{ fontSize: 13, color: "#374151" }}>
          To{" "}
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            style={inputStyle}
          />
        </label>
        <label style={{ fontSize: 13, color: "#374151" }}>
          Group by{" "}
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as "day" | "week" | "month")}
            style={inputStyle}
          >
            <option value="day">Day</option>
            <option value="week">Week</option>
            <option value="month">Month</option>
          </select>
        </label>
        <button onClick={loadAll} style={{ ...btnStyle, background: "var(--color-primary)", color: "#fff", borderColor: "var(--color-primary)" }}>
          {loading ? "Loading…" : "Refresh"}
        </button>
        <div style={{ marginLeft: "auto", display: "flex", gap: "0.5rem" }}>
          <button onClick={() => exportCsv("revenue")} style={btnStyle}>↓ Revenue CSV</button>
          <button onClick={() => exportCsv("appointments")} style={btnStyle}>↓ Appointments CSV</button>
          <button onClick={() => exportCsv("services")} style={btnStyle}>↓ Services CSV</button>
        </div>
      </div>

      {error && <p style={{ color: "#dc2626", padding: "0.75rem", background: "#fef2f2", borderRadius: 6 }}>{error}</p>}

      {/* ── KPI Cards ── */}
      {summary && (
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1rem" }}>
          <StatCard
            label="Revenue"
            value={fmtMoney(summary.revenue.totalCents)}
            sub={`${summary.revenue.paidInvoices} paid invoices`}
          />
          <StatCard
            label="Appointments"
            value={String(summary.appointments.total)}
            sub={`${completionRate}% completion rate`}
          />
          <StatCard
            label="No-shows"
            value={String(summary.appointments.noShow)}
            sub={`${noShowRate}% of appointments`}
          />
          <StatCard
            label="Cancellations"
            value={String(summary.appointments.cancelled)}
          />
          <StatCard
            label="New Clients"
            value={String(summary.clients.new)}
            sub={`${summary.clients.total} total`}
          />
        </div>
      )}

      {/* ── Revenue by Period ── */}
      <SectionHeader>Revenue by {groupBy.charAt(0).toUpperCase() + groupBy.slice(1)}</SectionHeader>
      <Table
        headers={["Period", "Invoices", "Revenue"]}
        rows={(revenue?.byPeriod ?? []).map((r) => [
          fmtDate(r.period),
          r.invoiceCount,
          fmtMoney(r.totalCents),
        ])}
      />

      {/* ── Revenue by Groomer ── */}
      <SectionHeader>Revenue by Groomer</SectionHeader>
      <Table
        headers={["Groomer", "Invoices", "Revenue"]}
        rows={(revenue?.byGroomer ?? []).map((r) => [
          r.staffName,
          r.invoiceCount,
          fmtMoney(r.totalCents),
        ])}
      />

      {/* ── Appointment Trends ── */}
      <SectionHeader>Appointment Trends by {groupBy.charAt(0).toUpperCase() + groupBy.slice(1)}</SectionHeader>
      <Table
        headers={["Period", "Total", "Completed", "Cancelled", "No-shows"]}
        rows={apptTrends.map((r) => [
          fmtDate(r.period),
          r.total,
          r.completed,
          r.cancelled,
          r.noShow,
        ])}
      />

      {/* ── Service Popularity ── */}
      <SectionHeader>Service Popularity</SectionHeader>
      <Table
        headers={["Service", "Appointments", "Completed", "Revenue"]}
        rows={services.map((r) => [
          r.serviceName,
          r.appointmentCount,
          r.completedCount,
          fmtMoney(r.revenueCents),
        ])}
      />

      {/* ── Client Retention ── */}
      <SectionHeader>Client Retention</SectionHeader>
      {clientReport && (
        <div style={{ marginBottom: "0.75rem", display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <StatCard label="New Clients" value={String(clientReport.newClients.length)} />
          <StatCard label="Active This Period" value={String(clientReport.activeInPeriodCount)} />
          <StatCard
            label="Churn Risk (90+ days inactive)"
            value={String(clientReport.churnRiskTotal)}
            sub="Clients with no recent visit"
          />
        </div>
      )}

      <SectionHeader>Churn Risk — Clients Without a Visit in 90+ Days</SectionHeader>
      <Table
        headers={["Client", "Last Appointment"]}
        rows={(clientReport?.churnRisk ?? []).map((r) => [
          r.clientName,
          fmtDate(r.lastAppointmentAt),
        ])}
      />
      {clientReport && clientReport.churnRiskTotal > 20 && (
        <p style={{ fontSize: 12, color: "#6b7280", marginTop: "0.25rem" }}>
          Showing top 20 of {clientReport.churnRiskTotal} at-risk clients.
        </p>
      )}
    </div>
  );
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const btnStyle: React.CSSProperties = {
  padding: "0.4rem 0.85rem",
  border: "1px solid #d1d5db",
  borderRadius: 6,
  background: "#fff",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 500,
};

const inputStyle: React.CSSProperties = {
  padding: "0.35rem 0.5rem",
  border: "1px solid #d1d5db",
  borderRadius: 6,
  fontSize: 13,
  marginLeft: "0.25rem",
};
