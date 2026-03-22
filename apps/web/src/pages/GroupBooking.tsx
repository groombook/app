import { useEffect, useState } from "react";
import type { Client, Pet, Service, Staff } from "@groombook/types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PetSlot {
  petId: string;
  serviceId: string;
  staffId: string;
  endTime: string; // HH:MM
}

interface GroupAppointment {
  id: string;
  petId: string;
  petName?: string;
  serviceId: string;
  serviceName?: string;
  staffId: string | null;
  staffName?: string | null;
  status: string;
  startTime: string;
  endTime: string;
}

interface AppointmentGroup {
  id: string;
  clientId: string;
  notes: string | null;
  createdAt: string;
  appointments: GroupAppointment[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString();
}

const STATUS_COLORS: Record<string, string> = {
  scheduled: "#3b82f6",
  confirmed: "#10b981",
  in_progress: "#f59e0b",
  completed: "#6b7280",
  cancelled: "#ef4444",
  no_show: "#9ca3af",
};

// ─── New Group Booking Form ───────────────────────────────────────────────────

function NewGroupBookingForm({
  clients,
  pets,
  services,
  staff,
  onCreated,
  onClose,
}: {
  clients: Client[];
  pets: Pet[];
  services: Service[];
  staff: Staff[];
  onCreated: () => void;
  onClose: () => void;
}) {
  const [clientId, setClientId] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState("09:00");
  const [notes, setNotes] = useState("");
  const [petSlots, setPetSlots] = useState<PetSlot[]>([
    { petId: "", serviceId: "", staffId: "", endTime: "10:00" },
    { petId: "", serviceId: "", staffId: "", endTime: "10:00" },
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clientPets = pets.filter((p) => p.clientId === clientId);
  const activeServices = services.filter((s) => s.active);
  const activeStaff = staff.filter((s) => s.active);

  function addPetSlot() {
    setPetSlots((prev) => [
      ...prev,
      { petId: "", serviceId: "", staffId: "", endTime: "10:00" },
    ]);
  }

  function removePetSlot(i: number) {
    setPetSlots((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateSlot(i: number, field: keyof PetSlot, value: string) {
    setPetSlots((prev) =>
      prev.map((slot, idx) =>
        idx === i ? { ...slot, [field]: value } : slot
      )
    );
  }

  // Auto-set end time based on service duration when service changes
  function handleServiceChange(i: number, serviceId: string) {
    const svc = services.find((s) => s.id === serviceId);
    if (svc && startTime) {
      const [h, m] = startTime.split(":").map(Number);
      const totalMins = (h ?? 0) * 60 + (m ?? 0) + svc.durationMinutes;
      const endH = String(Math.floor(totalMins / 60) % 24).padStart(2, "0");
      const endM = String(totalMins % 60).padStart(2, "0");
      updateSlot(i, "serviceId", serviceId);
      updateSlot(i, "endTime", `${endH}:${endM}`);
    } else {
      updateSlot(i, "serviceId", serviceId);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!clientId) { setError("Please select a client"); return; }
    if (petSlots.length < 2) { setError("Add at least 2 pets"); return; }
    if (petSlots.some((s) => !s.petId || !s.serviceId)) {
      setError("Each pet slot needs a pet and service selected");
      return;
    }

    setSaving(true);
    setError(null);

    const payload = {
      clientId,
      startTime: `${date}T${startTime}:00.000Z`,
      notes: notes || undefined,
      pets: petSlots.map((slot) => ({
        petId: slot.petId,
        serviceId: slot.serviceId,
        staffId: slot.staffId || undefined,
        endTime: `${date}T${slot.endTime}:00.000Z`,
      })),
    };

    try {
      const res = await fetch("/api/appointment-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      onCreated();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create group booking");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal onClose={onClose}>
      <h2 style={{ marginTop: 0 }}>New Group Booking</h2>
      <p style={{ fontSize: 13, color: "#6b7280", marginTop: 0 }}>
        Book multiple pets from the same client in a single visit. Each pet can have a different groomer.
      </p>
      <form onSubmit={submit}>
        <Field label="Client">
          <select
            value={clientId}
            onChange={(e) => { setClientId(e.target.value); setPetSlots([{ petId: "", serviceId: "", staffId: "", endTime: "10:00" }, { petId: "", serviceId: "", staffId: "", endTime: "10:00" }]); }}
            required
            style={inputStyle}
          >
            <option value="">— Select client —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>

        <div style={{ display: "flex", gap: "0.75rem" }}>
          <Field label="Date" style={{ flex: 1 }}>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required style={inputStyle} />
          </Field>
          <Field label="Start Time" style={{ flex: 1 }}>
            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required style={inputStyle} />
          </Field>
        </div>

        <div style={{ marginBottom: "0.75rem" }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: "0.5rem", color: "#374151" }}>
            Pets ({petSlots.length})
          </div>
          {petSlots.map((slot, i) => (
            <div
              key={i}
              style={{
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: 6,
                padding: "0.75rem",
                marginBottom: "0.5rem",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>Pet {i + 1}</span>
                {petSlots.length > 2 && (
                  <button
                    type="button"
                    onClick={() => removePetSlot(i)}
                    style={{ ...btnStyle, color: "#dc2626", fontSize: 12, padding: "0.2rem 0.5rem" }}
                  >
                    Remove
                  </button>
                )}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                <Field label="Pet">
                  <select
                    value={slot.petId}
                    onChange={(e) => updateSlot(i, "petId", e.target.value)}
                    required
                    style={inputStyle}
                    disabled={!clientId}
                  >
                    <option value="">— Select pet —</option>
                    {clientPets.map((p) => (
                      <option key={p.id} value={p.id}>{p.name} ({p.species})</option>
                    ))}
                  </select>
                </Field>
                <Field label="Service">
                  <select
                    value={slot.serviceId}
                    onChange={(e) => handleServiceChange(i, e.target.value)}
                    required
                    style={inputStyle}
                  >
                    <option value="">— Select service —</option>
                    {activeServices.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Groomer (optional)">
                  <select
                    value={slot.staffId}
                    onChange={(e) => updateSlot(i, "staffId", e.target.value)}
                    style={inputStyle}
                  >
                    <option value="">— Unassigned —</option>
                    {activeStaff.filter((s) => s.role === "groomer").map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </Field>
                <Field label="End Time">
                  <input
                    type="time"
                    value={slot.endTime}
                    onChange={(e) => updateSlot(i, "endTime", e.target.value)}
                    required
                    style={inputStyle}
                  />
                </Field>
              </div>
            </div>
          ))}
          <button type="button" onClick={addPetSlot} style={btnStyle}>
            + Add another pet
          </button>
        </div>

        <Field label="Notes (optional)">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            style={{ ...inputStyle, resize: "vertical" }}
          />
        </Field>

        {error && <p style={{ color: "#dc2626", margin: "0.5rem 0 0", fontSize: 13 }}>{error}</p>}

        <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
          <button
            type="submit"
            disabled={saving}
            style={{ ...btnStyle, backgroundColor: "var(--color-primary)", color: "#fff", borderColor: "var(--color-primary)" }}
          >
            {saving ? "Booking…" : "Create Group Booking"}
          </button>
          <button type="button" onClick={onClose} style={btnStyle}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Group Card ───────────────────────────────────────────────────────────────

function GroupCard({
  group,
  onCancel,
}: {
  group: AppointmentGroup;
  onCancel: (id: string) => void;
}) {
  const startTime = group.appointments[0]?.startTime;
  const allCancelled = group.appointments.every((a) => a.status === "cancelled");

  return (
    <div
      style={{
        border: "1px solid #e2e8f0",
        borderRadius: 8,
        marginBottom: "0.75rem",
        background: allCancelled ? "#f8fafc" : "#fff",
        opacity: allCancelled ? 0.6 : 1,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0.75rem 1rem",
          borderBottom: "1px solid #e2e8f0",
          background: "#f8fafc",
          borderRadius: "8px 8px 0 0",
        }}
      >
        <div>
          <strong style={{ fontSize: 14 }}>
            Group Visit — {startTime ? fmtDate(startTime) : "—"}
            {startTime && ` at ${fmtTime(startTime)}`}
          </strong>
          {group.notes && (
            <span style={{ marginLeft: "0.75rem", fontSize: 12, color: "#6b7280" }}>
              {group.notes}
            </span>
          )}
        </div>
        {!allCancelled && (
          <button
            onClick={() => onCancel(group.id)}
            style={{ ...btnStyle, color: "#dc2626", borderColor: "#dc2626", fontSize: 12 }}
          >
            Cancel All
          </button>
        )}
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ background: "#fafafa" }}>
            {["Pet", "Service", "Groomer", "End Time", "Status"].map((h) => (
              <th key={h} style={{ textAlign: "left", padding: "0.4rem 1rem", fontWeight: 600, color: "#6b7280", fontSize: 12 }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {group.appointments.map((appt) => (
            <tr key={appt.id}>
              <td style={tdStyle}>{appt.petName ?? appt.petId}</td>
              <td style={tdStyle}>{appt.serviceName ?? appt.serviceId}</td>
              <td style={tdStyle}>{appt.staffName ?? <span style={{ color: "#9ca3af" }}>Unassigned</span>}</td>
              <td style={tdStyle}>{fmtTime(appt.endTime)}</td>
              <td style={tdStyle}>
                <span
                  style={{
                    padding: "2px 8px",
                    borderRadius: 12,
                    fontSize: 11,
                    fontWeight: 600,
                    background: `${STATUS_COLORS[appt.status] ?? "#6b7280"}22`,
                    color: STATUS_COLORS[appt.status] ?? "#374151",
                  }}
                >
                  {appt.status.replace("_", " ")}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function GroupBookingPage() {
  const [groups, setGroups] = useState<AppointmentGroup[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [pets, setPets] = useState<Pet[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [clientFilter, setClientFilter] = useState("");

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const qs = clientFilter ? `?clientId=${clientFilter}` : "";
      const [groupRes, clientRes, petRes, svcRes, staffRes] = await Promise.all([
        fetch(`/api/appointment-groups${qs}`),
        fetch("/api/clients"),
        fetch("/api/pets"),
        fetch("/api/services"),
        fetch("/api/staff"),
      ]);

      if (!groupRes.ok || !clientRes.ok || !petRes.ok || !svcRes.ok || !staffRes.ok) {
        throw new Error("Failed to load data");
      }

      const [groupData, clientData, petData, svcData, staffData] = await Promise.all([
        groupRes.json() as Promise<AppointmentGroup[]>,
        clientRes.json() as Promise<Client[]>,
        petRes.json() as Promise<Pet[]>,
        svcRes.json() as Promise<Service[]>,
        staffRes.json() as Promise<Staff[]>,
      ]);

      setGroups(groupData);
      setClients(clientData);
      setPets(petData);
      setServices(svcData);
      setStaff(staffData);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, [clientFilter]); // re-fetch when client filter changes

  async function cancelGroup(groupId: string) {
    if (!confirm("Cancel all appointments in this group visit?")) return;
    const res = await fetch(`/api/appointment-groups/${groupId}`, { method: "DELETE" });
    if (res.ok) loadAll();
  }

  if (loading && groups.length === 0) return <p style={{ padding: "1rem" }}>Loading…</p>;
  if (error) return <p style={{ padding: "1rem", color: "#dc2626" }}>Error: {error}</p>;

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.25rem", flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>Group Bookings</h1>
        <select
          value={clientFilter}
          onChange={(e) => setClientFilter(e.target.value)}
          style={{ ...inputStyle, width: "auto", minWidth: 180 }}
        >
          <option value="">All Clients</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <button
          onClick={() => setShowCreate(true)}
          style={{ ...btnStyle, marginLeft: "auto", backgroundColor: "var(--color-primary)", color: "#fff", borderColor: "var(--color-primary)" }}
        >
          + New Group Booking
        </button>
      </div>

      {groups.length === 0 ? (
        <div style={{ textAlign: "center", padding: "3rem 1rem", color: "#6b7280" }}>
          <p style={{ fontSize: 16, marginBottom: "0.5rem" }}>No group bookings yet.</p>
          <p style={{ fontSize: 13 }}>
            Use group bookings when a client brings multiple pets in the same visit — each pet can have a different groomer working simultaneously.
          </p>
        </div>
      ) : (
        groups.map((group) => (
          <GroupCard
            key={group.id}
            group={{
              ...group,
              appointments: group.appointments.map((appt) => ({
                ...appt,
                petName: pets.find((p) => p.id === appt.petId)?.name,
                serviceName: services.find((s) => s.id === appt.serviceId)?.name,
                staffName: staff.find((s) => s.id === appt.staffId)?.name,
              })),
            }}
            onCancel={cancelGroup}
          />
        ))
      )}

      {showCreate && (
        <NewGroupBookingForm
          clients={clients}
          pets={pets}
          services={services}
          staff={staff}
          onCreated={() => { setShowCreate(false); loadAll(); }}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  );
}

// ─── Shared UI helpers ────────────────────────────────────────────────────────

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "#fff", borderRadius: 8, padding: "1.5rem",
        maxWidth: 640, width: "calc(100% - 2rem)", maxHeight: "90vh", overflowY: "auto",
        boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
      }}>
        {children}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  style,
}: {
  label: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div style={{ marginBottom: "0.5rem", ...style }}>
      <label style={{ display: "block", fontWeight: 600, marginBottom: "0.2rem", fontSize: 12, color: "#6b7280" }}>
        {label}
      </label>
      {children}
    </div>
  );
}

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
  width: "100%",
  padding: "0.45rem 0.6rem",
  border: "1px solid #d1d5db",
  borderRadius: 6,
  fontSize: 13,
  boxSizing: "border-box",
};

const tdStyle: React.CSSProperties = {
  padding: "0.5rem 1rem",
  borderBottom: "1px solid #f3f4f6",
  color: "#374151",
};
