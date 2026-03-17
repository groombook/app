import { useEffect, useState, useCallback } from "react";
import type { Appointment, Client, Pet, Service, Staff } from "@groombook/types";

// ─── Helpers ────────────────────────────────────────────────────────────────

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day; // Monday start
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function fmtDateShort(d: Date): string {
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

const STATUS_COLORS: Record<string, string> = {
  scheduled: "#3b82f6",
  confirmed: "#10b981",
  in_progress: "#f59e0b",
  completed: "#6b7280",
  cancelled: "#ef4444",
  no_show: "#9ca3af",
};

const STATUS_TRANSITIONS: Record<string, string[]> = {
  scheduled: ["confirmed", "cancelled", "no_show"],
  confirmed: ["in_progress", "cancelled", "no_show"],
  in_progress: ["completed", "no_show"],
  completed: [],
  cancelled: [],
  no_show: [],
};

// ─── Types ───────────────────────────────────────────────────────────────────

interface BookingForm {
  clientId: string;
  petId: string;
  serviceId: string;
  staffId: string;
  date: string;
  startTime: string;
  notes: string;
}

const EMPTY_FORM: BookingForm = {
  clientId: "",
  petId: "",
  serviceId: "",
  staffId: "",
  date: formatDate(new Date()),
  startTime: "09:00",
  notes: "",
};

// ─── Component ───────────────────────────────────────────────────────────────

export function AppointmentsPage() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [pets, setPets] = useState<Pet[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<BookingForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null);

  const weekEnd = addDays(weekStart, 6);

  const loadAppointments = useCallback(() => {
    const from = weekStart.toISOString();
    const to = addDays(weekStart, 7).toISOString();
    return fetch(`/api/appointments?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<Appointment[]>;
      })
      .then(setAppointments);
  }, [weekStart]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      loadAppointments(),
      fetch("/api/clients").then((r) => r.json() as Promise<Client[]>).then(setClients),
      fetch("/api/services").then((r) => r.json() as Promise<Service[]>).then(setServices),
      fetch("/api/staff").then((r) => r.json() as Promise<Staff[]>).then(setStaff),
    ])
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Unknown error"))
      .finally(() => setLoading(false));
  }, [loadAppointments]);

  // Load pets when client is selected
  useEffect(() => {
    if (!form.clientId) {
      setPets([]);
      setForm((f) => ({ ...f, petId: "" }));
      return;
    }
    fetch(`/api/pets?clientId=${encodeURIComponent(form.clientId)}`)
      .then((r) => r.json() as Promise<Pet[]>)
      .then(setPets);
  }, [form.clientId]);

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const apptsByDay = days.map((day) => {
    const dateStr = formatDate(day);
    return appointments.filter((a) => a.startTime.startsWith(dateStr));
  });

  function openNewForm(date?: Date) {
    setForm({ ...EMPTY_FORM, date: formatDate(date ?? new Date()) });
    setFormError(null);
    setShowForm(true);
  }

  async function submitBooking(e: React.FormEvent) {
    e.preventDefault();
    if (!form.clientId || !form.petId || !form.serviceId) {
      setFormError("Client, pet, and service are required.");
      return;
    }

    const service = services.find((s) => s.id === form.serviceId);
    if (!service) return;

    const startISO = new Date(`${form.date}T${form.startTime}`).toISOString();
    const endDate = new Date(`${form.date}T${form.startTime}`);
    endDate.setMinutes(endDate.getMinutes() + service.durationMinutes);
    const endISO = endDate.toISOString();

    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: form.clientId,
          petId: form.petId,
          serviceId: form.serviceId,
          staffId: form.staffId || undefined,
          startTime: startISO,
          endTime: endISO,
          notes: form.notes || undefined,
        }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      setShowForm(false);
      await loadAppointments();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(appt: Appointment, status: string) {
    try {
      const res = await fetch(`/api/appointments/${appt.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSelectedAppt(null);
      await loadAppointments();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Failed to update");
    }
  }

  async function deleteAppt(id: string) {
    if (!confirm("Delete this appointment?")) return;
    await fetch(`/api/appointments/${id}`, { method: "DELETE" });
    setSelectedAppt(null);
    await loadAppointments();
  }

  if (loading) return <p style={{ padding: "1rem" }}>Loading…</p>;
  if (error) return <p style={{ padding: "1rem", color: "red" }}>Error: {error}</p>;

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>Appointments</h1>
        <button onClick={() => setWeekStart((w) => addDays(w, -7))} style={btnStyle}>
          ← Prev
        </button>
        <span style={{ fontWeight: 600, fontSize: 14 }}>
          {fmtDateShort(weekStart)} – {fmtDateShort(weekEnd)}
        </span>
        <button onClick={() => setWeekStart((w) => addDays(w, 7))} style={btnStyle}>
          Next →
        </button>
        <button onClick={() => setWeekStart(startOfWeek(new Date()))} style={btnStyle}>
          Today
        </button>
        <button
          onClick={() => openNewForm()}
          style={{ ...btnStyle, backgroundColor: "#3b82f6", color: "#fff", marginLeft: "auto", borderColor: "#3b82f6" }}
        >
          + New Appointment
        </button>
      </div>

      {/* ── Weekly Calendar ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "0.5rem" }}>
        {days.map((day, i) => {
          const isToday = formatDate(day) === formatDate(new Date());
          return (
            <div key={i} style={{ border: "1px solid #e2e8f0", borderRadius: 6, overflow: "hidden", minHeight: 180 }}>
              <div
                style={{
                  padding: "0.35rem 0.5rem",
                  background: isToday ? "#3b82f6" : "#f8fafc",
                  color: isToday ? "#fff" : "#374151",
                  fontWeight: 600,
                  fontSize: 12,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span>{fmtDateShort(day)}</span>
                <button
                  onClick={() => openNewForm(day)}
                  style={{
                    border: "none",
                    background: "transparent",
                    color: isToday ? "#fff" : "#6b7280",
                    cursor: "pointer",
                    fontSize: 16,
                    padding: 0,
                    lineHeight: 1,
                  }}
                  title="Add appointment"
                >
                  +
                </button>
              </div>
              <div style={{ padding: "0.3rem" }}>
                {(apptsByDay[i] ?? []).map((a) => {
                  const svc = services.find((s) => s.id === a.serviceId);
                  const cli = clients.find((c) => c.id === a.clientId);
                  return (
                    <div
                      key={a.id}
                      onClick={() => setSelectedAppt(a)}
                      style={{
                        background: STATUS_COLORS[a.status] ?? "#94a3b8",
                        color: "#fff",
                        borderRadius: 4,
                        padding: "0.2rem 0.35rem",
                        marginBottom: "0.2rem",
                        fontSize: 11,
                        cursor: "pointer",
                        lineHeight: 1.4,
                      }}
                    >
                      <div style={{ fontWeight: 600 }}>{fmtTime(a.startTime)}</div>
                      <div>{cli?.name ?? "—"}</div>
                      <div style={{ opacity: 0.9 }}>{svc?.name ?? "—"}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Booking Form Modal ── */}
      {showForm && (
        <Modal onClose={() => setShowForm(false)}>
          <h2 style={{ marginTop: 0 }}>New Appointment</h2>
          <form onSubmit={submitBooking}>
            <Field label="Client">
              <select
                value={form.clientId}
                onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value }))}
                required
                style={inputStyle}
              >
                <option value="">— select client —</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Pet">
              <select
                value={form.petId}
                onChange={(e) => setForm((f) => ({ ...f, petId: e.target.value }))}
                required
                disabled={!form.clientId}
                style={inputStyle}
              >
                <option value="">— select pet —</option>
                {pets.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Service">
              <select
                value={form.serviceId}
                onChange={(e) => setForm((f) => ({ ...f, serviceId: e.target.value }))}
                required
                style={inputStyle}
              >
                <option value="">— select service —</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.durationMinutes} min — ${(s.basePriceCents / 100).toFixed(2)})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Groomer (optional)">
              <select
                value={form.staffId}
                onChange={(e) => setForm((f) => ({ ...f, staffId: e.target.value }))}
                style={inputStyle}
              >
                <option value="">— any / unassigned —</option>
                {staff.filter((s) => s.active).map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Date">
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                required
                style={inputStyle}
              />
            </Field>
            <Field label="Start time">
              <input
                type="time"
                value={form.startTime}
                onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
                required
                style={inputStyle}
              />
            </Field>
            <Field label="Notes">
              <textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={3}
                style={{ ...inputStyle, resize: "vertical" }}
              />
            </Field>
            {formError && <p style={{ color: "red", margin: "0.5rem 0 0" }}>{formError}</p>}
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
              <button
                type="submit"
                disabled={saving}
                style={{ ...btnStyle, backgroundColor: "#3b82f6", color: "#fff", borderColor: "#3b82f6" }}
              >
                {saving ? "Saving…" : "Book Appointment"}
              </button>
              <button type="button" onClick={() => setShowForm(false)} style={btnStyle}>
                Cancel
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Appointment Detail Modal ── */}
      {selectedAppt && (
        <Modal onClose={() => setSelectedAppt(null)}>
          <AppointmentDetail
            appt={selectedAppt}
            clients={clients}
            services={services}
            staff={staff}
            onUpdateStatus={updateStatus}
            onDelete={deleteAppt}
            onClose={() => setSelectedAppt(null)}
          />
        </Modal>
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function AppointmentDetail({
  appt,
  clients,
  services,
  staff,
  onUpdateStatus,
  onDelete,
  onClose,
}: {
  appt: Appointment;
  clients: Client[];
  services: Service[];
  staff: Staff[];
  onUpdateStatus: (a: Appointment, status: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const client = clients.find((c) => c.id === appt.clientId);
  const service = services.find((s) => s.id === appt.serviceId);
  const groomer = staff.find((s) => s.id === appt.staffId);
  const transitions = STATUS_TRANSITIONS[appt.status] ?? [];

  return (
    <>
      <h2 style={{ marginTop: 0 }}>Appointment Details</h2>
      <table style={{ borderCollapse: "collapse", width: "100%", marginBottom: "1rem", fontSize: 14 }}>
        <tbody>
          {([
            ["Client", client?.name ?? "—"],
            ["Service", service?.name ?? "—"],
            ["Groomer", groomer?.name ?? "Unassigned"],
            ["Start", new Date(appt.startTime).toLocaleString()],
            ["End", new Date(appt.endTime).toLocaleString()],
            ["Status", appt.status.replace("_", " ")],
            ["Notes", appt.notes ?? "—"],
          ] as [string, string][]).map(([label, value]) => (
            <tr key={label}>
              <td style={{ padding: "4px 12px 4px 0", fontWeight: 600, whiteSpace: "nowrap", verticalAlign: "top", color: "#6b7280" }}>
                {label}
              </td>
              <td style={{ padding: "4px 0" }}>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {transitions.length > 0 && (
        <div style={{ marginBottom: "0.75rem" }}>
          <span style={{ fontWeight: 600, fontSize: 13, marginRight: "0.5rem" }}>Move to:</span>
          {transitions.map((s) => (
            <button
              key={s}
              onClick={() => onUpdateStatus(appt, s)}
              style={{
                ...btnStyle,
                backgroundColor: STATUS_COLORS[s],
                color: "#fff",
                borderColor: STATUS_COLORS[s],
                marginRight: "0.4rem",
                marginBottom: "0.3rem",
              }}
            >
              {s.replace("_", " ")}
            </button>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: "0.5rem" }}>
        {appt.status !== "completed" && appt.status !== "cancelled" && (
          <button
            onClick={() => onDelete(appt.id)}
            style={{ ...btnStyle, backgroundColor: "#ef4444", color: "#fff", borderColor: "#ef4444" }}
          >
            Delete
          </button>
        )}
        <button onClick={onClose} style={btnStyle}>Close</button>
      </div>
    </>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 8,
          padding: "1.5rem",
          maxWidth: 500,
          width: "calc(100% - 2rem)",
          maxHeight: "90vh",
          overflowY: "auto",
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
  padding: "0.35rem 0.75rem",
  border: "1px solid #d1d5db",
  borderRadius: 4,
  background: "#f9fafb",
  cursor: "pointer",
  fontSize: 13,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.4rem 0.5rem",
  border: "1px solid #d1d5db",
  borderRadius: 4,
  fontSize: 14,
  boxSizing: "border-box",
};
