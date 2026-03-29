import { useEffect, useState } from "react";
import type { Staff } from "@groombook/types";

interface StaffForm {
  name: string;
  email: string;
  role: "groomer" | "receptionist" | "manager";
}

const EMPTY_FORM: StaffForm = { name: "", email: "", role: "groomer" };

export function StaffPage() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [me, setMe] = useState<Staff | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Staff | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<StaffForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [togglingSuperUser, setTogglingSuperUser] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);

  const isCurrentUserSuperUser = me?.isSuperUser ?? false;
  const activeSuperUserCount = staff.filter((s) => s.active && s.isSuperUser).length;

  async function load() {
    const r = await fetch("/api/staff?includeInactive=true");
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    setStaff((await r.json()) as Staff[]);
  }

  async function loadMe() {
    const r = await fetch("/api/staff/me");
    if (r.ok) {
      setMe((await r.json()) as Staff);
    }
  }

  useEffect(() => {
    Promise.all([load(), loadMe()])
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Unknown error"))
      .finally(() => setLoading(false));
  }, []);

  function openNew() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setShowForm(true);
  }

  function openEdit(s: Staff) {
    setEditing(s);
    setForm({ name: s.name, email: s.email, role: s.role });
    setFormError(null);
    setShowForm(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      const res = editing
        ? await fetch(`/api/staff/${editing.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: form.name, role: form.role }) })
        : await fetch("/api/staff", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
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

  async function toggleActive(s: Staff) {
    await fetch(`/api/staff/${s.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !s.active }) });
    await load();
  }

  async function toggleSuperUser(s: Staff) {
    setTogglingSuperUser(s.id);
    setToggleError(null);
    try {
      const newValue = !s.isSuperUser;
      const res = await fetch(`/api/staff/${s.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isSuperUser: newValue }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        setToggleError(err.error ?? `HTTP ${res.status}`);
        return;
      }
      await load();
    } finally {
      setTogglingSuperUser(null);
    }
  }

  if (loading) return <p style={{ padding: "1rem" }}>Loading…</p>;
  if (error) return <p style={{ padding: "1rem", color: "red" }}>Error: {error}</p>;

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1rem" }}>
        <h1 style={{ margin: 0 }}>Staff</h1>
        <button onClick={openNew} style={{ ...btnStyle, backgroundColor: "var(--color-primary)", color: "#fff", borderColor: "var(--color-primary)", marginLeft: "auto" }}>
          + Add Staff
        </button>
      </div>

      {toggleError && (
        <p style={{ color: "#dc2626", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, padding: "0.5rem 0.75rem", marginBottom: "0.75rem", fontSize: 13 }}>
          {toggleError}
        </p>
      )}

      {staff.length === 0 ? (
        <p>No staff members yet.</p>
      ) : (
        <div style={{ background: "#fff", borderRadius: 8, border: "1px solid #e5e7eb", overflow: "hidden", boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ background: "#f8fafc" }}>
              {["Name", "Email", "Role", "Super User", "Status", ""].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "0.55rem 0.75rem", borderBottom: "1px solid #e5e7eb", fontSize: 11, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.04em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.id} style={{ opacity: s.active ? 1 : 0.5 }}>
                <td style={tdStyle}>{s.name}</td>
                <td style={tdStyle}>{s.email}</td>
                <td style={tdStyle}><span style={{ textTransform: "capitalize" }}>{s.role}</span></td>
                <td style={tdStyle}>
                  {s.isSuperUser ? (
                    <>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 600, background: "#ede9fe", color: "#5b21b6" }}>
                        ★ Super User
                      </span>
                      {isCurrentUserSuperUser && s.id !== me?.id && (
                        <button
                          onClick={() => toggleSuperUser(s)}
                          disabled={togglingSuperUser === s.id || activeSuperUserCount <= 1}
                          title={activeSuperUserCount <= 1 ? "Cannot revoke: last super user" : undefined}
                          style={{ ...btnStyle, padding: "0.2rem 0.6rem", fontSize: 11, background: "#f3f4f6", color: "#374151", borderColor: "#d1d5db", marginLeft: 4 }}
                        >
                          {togglingSuperUser === s.id ? "…" : "Revoke"}
                        </button>
                      )}
                    </>
                  ) : isCurrentUserSuperUser ? (
                    <button
                      onClick={() => toggleSuperUser(s)}
                      disabled={togglingSuperUser === s.id}
                      style={{ ...btnStyle, padding: "0.2rem 0.6rem", fontSize: 11, background: "#f3f4f6", color: "#374151", borderColor: "#d1d5db" }}
                    >
                      {togglingSuperUser === s.id ? "…" : "+ Grant"}
                    </button>
                  ) : null}
                </td>
                <td style={tdStyle}>
                  <span style={{ padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 600, background: s.active ? "#d1fae5" : "#f3f4f6", color: s.active ? "#065f46" : "#6b7280" }}>
                    {s.active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                  <button onClick={() => openEdit(s)} style={{ ...btnStyle, marginRight: "0.4rem" }}>Edit</button>
                  <button
                    onClick={() => toggleActive(s)}
                    disabled={s.isSuperUser && activeSuperUserCount <= 1 && s.active}
                    title={s.isSuperUser && activeSuperUserCount <= 1 && s.active ? "Cannot deactivate the last super user" : undefined}
                    style={{ ...btnStyle, opacity: s.isSuperUser && activeSuperUserCount <= 1 && s.active ? 0.5 : 1 }}
                  >
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
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowForm(false); }}
        >
          <div style={{ background: "#fff", borderRadius: 8, padding: "1.5rem", maxWidth: 400, width: "calc(100% - 2rem)", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
            <h2 style={{ marginTop: 0 }}>{editing ? "Edit Staff" : "New Staff Member"}</h2>
            <form onSubmit={submit}>
              <div style={{ marginBottom: "0.75rem" }}>
                <label style={labelStyle}>Full name</label>
                <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required style={inputStyle} />
              </div>
              {!editing && (
                <div style={{ marginBottom: "0.75rem" }}>
                  <label style={labelStyle}>Email</label>
                  <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} required style={inputStyle} />
                </div>
              )}
              <div style={{ marginBottom: "0.75rem" }}>
                <label style={labelStyle}>Role</label>
                <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as StaffForm["role"] }))} style={inputStyle}>
                  <option value="groomer">Groomer</option>
                  <option value="receptionist">Receptionist</option>
                  <option value="manager">Manager</option>
                </select>
              </div>
              {formError && <p style={{ color: "red", margin: "0.5rem 0 0" }}>{formError}</p>}
              <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
                <button type="submit" disabled={saving} style={{ ...btnStyle, backgroundColor: "var(--color-primary)", color: "#fff", borderColor: "var(--color-primary)" }}>
                  {saving ? "Saving…" : editing ? "Save Changes" : "Add Staff"}
                </button>
                <button type="button" onClick={() => setShowForm(false)} style={btnStyle}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const btnStyle: React.CSSProperties = { padding: "0.4rem 0.85rem", border: "1px solid #d1d5db", borderRadius: 6, background: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 500 };
const inputStyle: React.CSSProperties = { width: "100%", padding: "0.45rem 0.6rem", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 14, boxSizing: "border-box" };
const labelStyle: React.CSSProperties = { display: "block", fontWeight: 600, marginBottom: "0.25rem", fontSize: 13, color: "#374151" };
const tdStyle: React.CSSProperties = { padding: "0.55rem 0.75rem", borderBottom: "1px solid #f3f4f6" };
