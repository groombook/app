import { useEffect, useState } from "react";
import type { Service } from "@groombook/types";

interface ServiceForm {
  name: string;
  description: string;
  priceStr: string;
  durationMinutes: number;
  active: boolean;
}

const EMPTY_FORM: ServiceForm = {
  name: "",
  description: "",
  priceStr: "",
  durationMinutes: 60,
  active: true,
};

export function ServicesPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Service | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ServiceForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function load() {
    const r = await fetch("/api/services?includeInactive=true");
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = (await r.json()) as Service[];
    setServices(data);
  }

  useEffect(() => {
    load()
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Unknown error"))
      .finally(() => setLoading(false));
  }, []);

  function openNew() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setShowForm(true);
  }

  function openEdit(s: Service) {
    setEditing(s);
    setForm({
      name: s.name,
      description: s.description ?? "",
      priceStr: (s.basePriceCents / 100).toFixed(2),
      durationMinutes: s.durationMinutes,
      active: s.active,
    });
    setFormError(null);
    setShowForm(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const price = parseFloat(form.priceStr);
    if (isNaN(price) || price <= 0) {
      setFormError("Price must be a positive number.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const body = {
        name: form.name,
        description: form.description || undefined,
        basePriceCents: Math.round(price * 100),
        durationMinutes: form.durationMinutes,
        active: form.active,
      };
      const res = editing
        ? await fetch(`/api/services/${editing.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        : await fetch("/api/services", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      setShowForm(false);
      await load();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(s: Service) {
    await fetch(`/api/services/${s.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !s.active }),
    });
    await load();
  }

  if (loading) return <p style={{ padding: "1rem" }}>Loading…</p>;
  if (error) return <p style={{ padding: "1rem", color: "red" }}>Error: {error}</p>;

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1rem" }}>
        <h1 style={{ margin: 0 }}>Services</h1>
        <button
          onClick={openNew}
          style={{ ...btnStyle, backgroundColor: "#4f8a6f", color: "#fff", borderColor: "#4f8a6f", marginLeft: "auto" }}
        >
          + Add Service
        </button>
      </div>

      {services.length === 0 ? (
        <p>No services configured yet.</p>
      ) : (
        <div style={{ background: "#fff", borderRadius: 8, border: "1px solid #e5e7eb", overflow: "hidden", boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ background: "#f8fafc" }}>
              {["Name", "Description", "Price", "Duration", "Status", ""].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "0.55rem 0.75rem", borderBottom: "1px solid #e5e7eb", fontSize: 11, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {services.map((s) => (
              <tr key={s.id} style={{ opacity: s.active ? 1 : 0.5 }}>
                <td style={tdStyle}>{s.name}</td>
                <td style={tdStyle}>{s.description ?? "—"}</td>
                <td style={tdStyle}>${(s.basePriceCents / 100).toFixed(2)}</td>
                <td style={tdStyle}>{s.durationMinutes} min</td>
                <td style={tdStyle}>
                  <span
                    style={{
                      padding: "2px 8px",
                      borderRadius: 12,
                      fontSize: 11,
                      fontWeight: 600,
                      background: s.active ? "#d1fae5" : "#f3f4f6",
                      color: s.active ? "#065f46" : "#6b7280",
                    }}
                  >
                    {s.active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                  <button onClick={() => openEdit(s)} style={{ ...btnStyle, marginRight: "0.4rem" }}>
                    Edit
                  </button>
                  <button onClick={() => toggleActive(s)} style={btnStyle}>
                    {s.active ? "Deactivate" : "Activate"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}

      {showForm && (
        <Modal onClose={() => setShowForm(false)}>
          <h2 style={{ marginTop: 0 }}>{editing ? "Edit Service" : "New Service"}</h2>
          <form onSubmit={submit}>
            <Field label="Name">
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
                style={inputStyle}
              />
            </Field>
            <Field label="Description (optional)">
              <textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={2}
                style={{ ...inputStyle, resize: "vertical" }}
              />
            </Field>
            <Field label="Price ($)">
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={form.priceStr}
                onChange={(e) => setForm((f) => ({ ...f, priceStr: e.target.value }))}
                required
                style={inputStyle}
              />
            </Field>
            <Field label="Duration (minutes)">
              <input
                type="number"
                min="5"
                step="5"
                value={form.durationMinutes}
                onChange={(e) => setForm((f) => ({ ...f, durationMinutes: parseInt(e.target.value) || 60 }))}
                required
                style={inputStyle}
              />
            </Field>
            <Field label="Status">
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
                />
                Active (visible to booking form)
              </label>
            </Field>
            {formError && <p style={{ color: "red", margin: "0.5rem 0 0" }}>{formError}</p>}
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
              <button
                type="submit"
                disabled={saving}
                style={{ ...btnStyle, backgroundColor: "#4f8a6f", color: "#fff", borderColor: "#4f8a6f" }}
              >
                {saving ? "Saving…" : editing ? "Save Changes" : "Create Service"}
              </button>
              <button type="button" onClick={() => setShowForm(false)} style={btnStyle}>
                Cancel
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

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
        maxWidth: 480, width: "calc(100% - 2rem)", maxHeight: "90vh", overflowY: "auto",
        boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
      }}>
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
