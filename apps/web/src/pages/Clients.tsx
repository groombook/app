import { useEffect, useState } from "react";
import type { Client, Pet } from "@groombook/types";

// ─── Forms ───────────────────────────────────────────────────────────────────

interface ClientForm {
  name: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
}

interface PetForm {
  name: string;
  species: string;
  breed: string;
  weightStr: string;
  dob: string;
  healthAlerts: string;
  groomingNotes: string;
}

const EMPTY_CLIENT: ClientForm = { name: "", email: "", phone: "", address: "", notes: "" };
const EMPTY_PET: PetForm = { name: "", species: "Dog", breed: "", weightStr: "", dob: "", healthAlerts: "", groomingNotes: "" };

// ─── Component ───────────────────────────────────────────────────────────────

export function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [pets, setPets] = useState<Pet[]>([]);
  const [petsLoading, setPetsLoading] = useState(false);

  // Client form
  const [showClientForm, setShowClientForm] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [clientForm, setClientForm] = useState<ClientForm>(EMPTY_CLIENT);
  const [clientFormError, setClientFormError] = useState<string | null>(null);
  const [savingClient, setSavingClient] = useState(false);

  // Pet form
  const [showPetForm, setShowPetForm] = useState(false);
  const [editingPet, setEditingPet] = useState<Pet | null>(null);
  const [petForm, setPetForm] = useState<PetForm>(EMPTY_PET);
  const [petFormError, setPetFormError] = useState<string | null>(null);
  const [savingPet, setSavingPet] = useState(false);
  const [deletingPetId, setDeletingPetId] = useState<string | null>(null);
  const [deletingClient, setDeletingClient] = useState(false);

  async function loadClients() {
    const r = await fetch("/api/clients");
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    setClients((await r.json()) as Client[]);
  }

  useEffect(() => {
    loadClients()
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Unknown error"))
      .finally(() => setLoading(false));
  }, []);

  async function loadPets(clientId: string) {
    setPetsLoading(true);
    const r = await fetch(`/api/pets?clientId=${encodeURIComponent(clientId)}`);
    setPets((await r.json()) as Pet[]);
    setPetsLoading(false);
  }

  function selectClient(c: Client) {
    setSelectedClient(c);
    loadPets(c.id);
  }

  // ── Client CRUD ──

  function openNewClient() {
    setEditingClient(null);
    setClientForm(EMPTY_CLIENT);
    setClientFormError(null);
    setShowClientForm(true);
  }

  function openEditClient(c: Client) {
    setEditingClient(c);
    setClientForm({ name: c.name, email: c.email ?? "", phone: c.phone ?? "", address: c.address ?? "", notes: c.notes ?? "" });
    setClientFormError(null);
    setShowClientForm(true);
  }

  async function submitClient(e: React.FormEvent) {
    e.preventDefault();
    setSavingClient(true);
    setClientFormError(null);
    try {
      const body = {
        name: clientForm.name,
        email: clientForm.email || undefined,
        phone: clientForm.phone || undefined,
        address: clientForm.address || undefined,
        notes: clientForm.notes || undefined,
      };
      const res = editingClient
        ? await fetch(`/api/clients/${editingClient.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        : await fetch("/api/clients", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const updated = (await res.json()) as Client;
      setShowClientForm(false);
      await loadClients();
      if (editingClient) setSelectedClient(updated);
    } catch (e: unknown) {
      setClientFormError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSavingClient(false);
    }
  }

  // ── Pet CRUD ──

  function openNewPet() {
    setEditingPet(null);
    setPetForm(EMPTY_PET);
    setPetFormError(null);
    setShowPetForm(true);
  }

  function openEditPet(p: Pet) {
    setEditingPet(p);
    setPetForm({
      name: p.name, species: p.species, breed: p.breed ?? "",
      weightStr: p.weightKg != null ? String(p.weightKg) : "",
      dob: p.dateOfBirth ? p.dateOfBirth.slice(0, 10) : "",
      healthAlerts: p.healthAlerts ?? "",
      groomingNotes: p.groomingNotes ?? "",
    });
    setPetFormError(null);
    setShowPetForm(true);
  }

  async function deletePet(petId: string) {
    if (!selectedClient) return;
    if (!window.confirm("Delete this pet? This cannot be undone.")) return;
    setDeletingPetId(petId);
    try {
      const res = await fetch(`/api/pets/${petId}`, { method: "DELETE" });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      await loadPets(selectedClient.id);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Failed to delete pet");
    } finally {
      setDeletingPetId(null);
    }
  }

  async function deleteClient(clientId: string) {
    if (!window.confirm("Delete this client and all their pets? This cannot be undone.")) return;
    setDeletingClient(true);
    try {
      const res = await fetch(`/api/clients/${clientId}`, { method: "DELETE" });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      setSelectedClient(null);
      setPets([]);
      await loadClients();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Failed to delete client");
    } finally {
      setDeletingClient(false);
    }
  }

  async function submitPet(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedClient) return;
    setSavingPet(true);
    setPetFormError(null);
    try {
      const body = {
        clientId: selectedClient.id,
        name: petForm.name,
        species: petForm.species,
        breed: petForm.breed || undefined,
        weightKg: petForm.weightStr ? parseFloat(petForm.weightStr) : undefined,
        dateOfBirth: petForm.dob ? new Date(petForm.dob).toISOString() : undefined,
        healthAlerts: petForm.healthAlerts || undefined,
        groomingNotes: petForm.groomingNotes || undefined,
      };
      const res = editingPet
        ? await fetch(`/api/pets/${editingPet.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        : await fetch("/api/pets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      setShowPetForm(false);
      await loadPets(selectedClient.id);
    } catch (e: unknown) {
      setPetFormError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSavingPet(false);
    }
  }

  const filtered = search
    ? clients.filter((c) =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.email?.toLowerCase().includes(search.toLowerCase()) ||
        c.phone?.includes(search)
      )
    : clients;

  if (loading) return <p style={{ padding: "1rem" }}>Loading…</p>;
  if (error) return <p style={{ padding: "1rem", color: "red" }}>Error: {error}</p>;

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", display: "flex", gap: "1.5rem" }}>
      {/* ── Client list ── */}
      <div style={{ width: 280, flexShrink: 0, borderRight: "1px solid #e2e8f0", paddingRight: "1rem" }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: "0.75rem" }}>
          <h1 style={{ margin: 0, fontSize: 20 }}>Clients</h1>
          <button
            onClick={openNewClient}
            style={{ ...btnStyle, backgroundColor: "#3b82f6", color: "#fff", borderColor: "#3b82f6", marginLeft: "auto", padding: "0.25rem 0.6rem" }}
          >
            + New
          </button>
        </div>
        <input
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ ...inputStyle, marginBottom: "0.75rem" }}
        />
        {filtered.length === 0 && <p style={{ color: "#6b7280", fontSize: 14 }}>No clients found.</p>}
        {filtered.map((c) => (
          <div
            key={c.id}
            onClick={() => selectClient(c)}
            style={{
              padding: "0.5rem 0.6rem", borderRadius: 6, cursor: "pointer", marginBottom: "0.2rem",
              background: selectedClient?.id === c.id ? "#eff6ff" : "transparent",
              border: selectedClient?.id === c.id ? "1px solid #bfdbfe" : "1px solid transparent",
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 14 }}>{c.name}</div>
            {c.email && <div style={{ fontSize: 12, color: "#6b7280" }}>{c.email}</div>}
            {c.phone && <div style={{ fontSize: 12, color: "#6b7280" }}>{c.phone}</div>}
          </div>
        ))}
      </div>

      {/* ── Client detail ── */}
      {selectedClient ? (
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "flex-start", marginBottom: "1rem" }}>
            <div>
              <h2 style={{ margin: "0 0 0.2rem" }}>{selectedClient.name}</h2>
              {selectedClient.email && <div style={{ fontSize: 14, color: "#6b7280" }}>{selectedClient.email}</div>}
              {selectedClient.phone && <div style={{ fontSize: 14, color: "#6b7280" }}>{selectedClient.phone}</div>}
              {selectedClient.address && <div style={{ fontSize: 13, color: "#6b7280" }}>{selectedClient.address}</div>}
              {selectedClient.notes && (
                <div style={{ fontSize: 13, marginTop: "0.4rem", background: "#fef9c3", padding: "0.4rem 0.6rem", borderRadius: 4, maxWidth: 500 }}>
                  {selectedClient.notes}
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: "0.5rem", marginLeft: "auto" }}>
              <button onClick={() => openEditClient(selectedClient)} style={btnStyle}>
                Edit client
              </button>
              <button
                onClick={() => { void deleteClient(selectedClient.id); }}
                disabled={deletingClient}
                style={{ ...btnStyle, color: "#dc2626", borderColor: "#fca5a5" }}
              >
                {deletingClient ? "Deleting…" : "Delete client"}
              </button>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem" }}>
            <h3 style={{ margin: 0 }}>Pets</h3>
            <button onClick={openNewPet} style={{ ...btnStyle, backgroundColor: "#10b981", color: "#fff", borderColor: "#10b981" }}>
              + Add pet
            </button>
          </div>

          {petsLoading ? (
            <p style={{ fontSize: 14 }}>Loading pets…</p>
          ) : pets.length === 0 ? (
            <p style={{ color: "#6b7280", fontSize: 14 }}>No pets on file for this client.</p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "0.75rem" }}>
              {pets.map((p) => (
                <div key={p.id} style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "0.75rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <strong style={{ fontSize: 15 }}>{p.name}</strong>
                    <div style={{ display: "flex", gap: "0.3rem" }}>
                      <button onClick={() => openEditPet(p)} style={{ ...btnStyle, padding: "0.15rem 0.5rem", fontSize: 11 }}>Edit</button>
                      <button
                        onClick={() => { void deletePet(p.id); }}
                        disabled={deletingPetId === p.id}
                        style={{ ...btnStyle, padding: "0.15rem 0.5rem", fontSize: 11, color: "#dc2626", borderColor: "#fca5a5" }}
                      >
                        {deletingPetId === p.id ? "…" : "Delete"}
                      </button>
                    </div>
                  </div>
                  <div style={{ fontSize: 13, color: "#6b7280", marginTop: "0.2rem" }}>
                    {p.species}{p.breed ? ` · ${p.breed}` : ""}
                  </div>
                  {p.weightKg != null && <div style={{ fontSize: 12, color: "#6b7280" }}>{p.weightKg} kg</div>}
                  {p.dateOfBirth && <div style={{ fontSize: 12, color: "#6b7280" }}>Born {new Date(p.dateOfBirth).toLocaleDateString()}</div>}
                  {p.healthAlerts && (
                    <div style={{ fontSize: 12, marginTop: "0.35rem", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 4, padding: "0.3rem 0.5rem", color: "#dc2626" }}>
                      <span style={{ fontWeight: 600 }}>⚠ Health alerts:</span> {p.healthAlerts}
                    </div>
                  )}
                  {p.groomingNotes && (
                    <div style={{ fontSize: 12, marginTop: "0.35rem", color: "#374151" }}>
                      <span style={{ fontWeight: 600 }}>Notes:</span> {p.groomingNotes}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af", fontSize: 15 }}>
          Select a client to view details
        </div>
      )}

      {/* ── Client modal ── */}
      {showClientForm && (
        <Modal onClose={() => setShowClientForm(false)}>
          <h2 style={{ marginTop: 0 }}>{editingClient ? "Edit Client" : "New Client"}</h2>
          <form onSubmit={submitClient}>
            <Field label="Full name">
              <input value={clientForm.name} onChange={(e) => setClientForm((f) => ({ ...f, name: e.target.value }))} required style={inputStyle} />
            </Field>
            <Field label="Email">
              <input type="email" value={clientForm.email} onChange={(e) => setClientForm((f) => ({ ...f, email: e.target.value }))} style={inputStyle} />
            </Field>
            <Field label="Phone">
              <input value={clientForm.phone} onChange={(e) => setClientForm((f) => ({ ...f, phone: e.target.value }))} style={inputStyle} />
            </Field>
            <Field label="Address">
              <input value={clientForm.address} onChange={(e) => setClientForm((f) => ({ ...f, address: e.target.value }))} style={inputStyle} />
            </Field>
            <Field label="Notes">
              <textarea value={clientForm.notes} onChange={(e) => setClientForm((f) => ({ ...f, notes: e.target.value }))} rows={3} style={{ ...inputStyle, resize: "vertical" }} />
            </Field>
            {clientFormError && <p style={{ color: "red", margin: "0.5rem 0 0" }}>{clientFormError}</p>}
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
              <button type="submit" disabled={savingClient} style={{ ...btnStyle, backgroundColor: "#3b82f6", color: "#fff", borderColor: "#3b82f6" }}>
                {savingClient ? "Saving…" : editingClient ? "Save Changes" : "Create Client"}
              </button>
              <button type="button" onClick={() => setShowClientForm(false)} style={btnStyle}>Cancel</button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Pet modal ── */}
      {showPetForm && (
        <Modal onClose={() => setShowPetForm(false)}>
          <h2 style={{ marginTop: 0 }}>{editingPet ? "Edit Pet" : "Add Pet"}</h2>
          <form onSubmit={submitPet}>
            <Field label="Pet name">
              <input value={petForm.name} onChange={(e) => setPetForm((f) => ({ ...f, name: e.target.value }))} required style={inputStyle} />
            </Field>
            <Field label="Species">
              <select value={petForm.species} onChange={(e) => setPetForm((f) => ({ ...f, species: e.target.value }))} style={inputStyle}>
                {["Dog", "Cat", "Rabbit", "Guinea Pig", "Other"].map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Breed (optional)">
              <input value={petForm.breed} onChange={(e) => setPetForm((f) => ({ ...f, breed: e.target.value }))} style={inputStyle} />
            </Field>
            <Field label="Weight kg (optional)">
              <input type="number" step="0.1" min="0" value={petForm.weightStr} onChange={(e) => setPetForm((f) => ({ ...f, weightStr: e.target.value }))} style={inputStyle} />
            </Field>
            <Field label="Date of birth (optional)">
              <input type="date" value={petForm.dob} onChange={(e) => setPetForm((f) => ({ ...f, dob: e.target.value }))} style={inputStyle} />
            </Field>
            <Field label="Health alerts (allergies, conditions, medications)">
              <textarea value={petForm.healthAlerts} onChange={(e) => setPetForm((f) => ({ ...f, healthAlerts: e.target.value }))} rows={2} style={{ ...inputStyle, resize: "vertical", borderColor: petForm.healthAlerts ? "#fca5a5" : undefined }} placeholder="e.g. Allergic to lavender, heart condition, on medication X" />
            </Field>
            <Field label="Grooming notes (optional)">
              <textarea value={petForm.groomingNotes} onChange={(e) => setPetForm((f) => ({ ...f, groomingNotes: e.target.value }))} rows={2} style={{ ...inputStyle, resize: "vertical" }} />
            </Field>
            {petFormError && <p style={{ color: "red", margin: "0.5rem 0 0" }}>{petFormError}</p>}
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
              <button type="submit" disabled={savingPet} style={{ ...btnStyle, backgroundColor: "#10b981", color: "#fff", borderColor: "#10b981" }}>
                {savingPet ? "Saving…" : editingPet ? "Save Changes" : "Add Pet"}
              </button>
              <button type="button" onClick={() => setShowPetForm(false)} style={btnStyle}>Cancel</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

// ─── Shared UI ───────────────────────────────────────────────────────────────

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: "#fff", borderRadius: 8, padding: "1.5rem", maxWidth: 480, width: "calc(100% - 2rem)", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "0.75rem" }}>
      <label style={{ display: "block", fontWeight: 600, marginBottom: "0.25rem", fontSize: 13, color: "#374151" }}>{label}</label>
      {children}
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: "0.35rem 0.75rem", border: "1px solid #d1d5db", borderRadius: 4, background: "#f9fafb", cursor: "pointer", fontSize: 13,
};

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "0.4rem 0.5rem", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 14, boxSizing: "border-box",
};
