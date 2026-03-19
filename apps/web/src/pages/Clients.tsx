import { useEffect, useState } from "react";
import type { Client, GroomingVisitLog, Pet } from "@groombook/types";

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
  cutStyle: string;
  shampooPreference: string;
  specialCareNotes: string;
}

interface VisitLogForm {
  cutStyle: string;
  productsUsed: string;
  notes: string;
  groomedAt: string;
}

const EMPTY_CLIENT: ClientForm = { name: "", email: "", phone: "", address: "", notes: "" };
const EMPTY_PET: PetForm = {
  name: "", species: "Dog", breed: "", weightStr: "", dob: "",
  healthAlerts: "", groomingNotes: "", cutStyle: "", shampooPreference: "", specialCareNotes: "",
};
const EMPTY_VISIT_LOG: VisitLogForm = { cutStyle: "", productsUsed: "", notes: "", groomedAt: "" };

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

  // Visit log
  const [logPetId, setLogPetId] = useState<string | null>(null);
  const [visitLogs, setVisitLogs] = useState<Record<string, GroomingVisitLog[]>>({});
  const [logsLoading, setLogsLoading] = useState<Record<string, boolean>>({});
  const [showLogForm, setShowLogForm] = useState(false);
  const [logForm, setLogForm] = useState<VisitLogForm>(EMPTY_VISIT_LOG);
  const [logFormError, setLogFormError] = useState<string | null>(null);
  const [savingLog, setSavingLog] = useState(false);

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

  async function loadVisitLogs(petId: string) {
    setLogsLoading((prev) => ({ ...prev, [petId]: true }));
    const r = await fetch(`/api/grooming-logs?petId=${encodeURIComponent(petId)}`);
    if (r.ok) {
      setVisitLogs((prev) => ({ ...prev, [petId]: (r.json() as unknown as Promise<GroomingVisitLog[]>).then ? [] : [] }));
      const logs = (await r.json()) as GroomingVisitLog[];
      setVisitLogs((prev) => ({ ...prev, [petId]: logs }));
    }
    setLogsLoading((prev) => ({ ...prev, [petId]: false }));
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
      cutStyle: p.cutStyle ?? "",
      shampooPreference: p.shampooPreference ?? "",
      specialCareNotes: p.specialCareNotes ?? "",
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
        cutStyle: petForm.cutStyle || undefined,
        shampooPreference: petForm.shampooPreference || undefined,
        specialCareNotes: petForm.specialCareNotes || undefined,
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

  // ── Visit Log ──

  function openLogForm(petId: string) {
    setLogPetId(petId);
    setLogForm({ ...EMPTY_VISIT_LOG, groomedAt: new Date().toISOString().slice(0, 16) });
    setLogFormError(null);
    setShowLogForm(true);
    // Load existing logs for this pet
    if (!visitLogs[petId]) {
      void loadVisitLogs(petId);
    }
  }

  async function submitVisitLog(e: React.FormEvent) {
    e.preventDefault();
    if (!logPetId) return;
    setSavingLog(true);
    setLogFormError(null);
    try {
      const body = {
        petId: logPetId,
        cutStyle: logForm.cutStyle || undefined,
        productsUsed: logForm.productsUsed || undefined,
        notes: logForm.notes || undefined,
        groomedAt: logForm.groomedAt ? new Date(logForm.groomedAt).toISOString() : undefined,
      };
      const res = await fetch("/api/grooming-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      setShowLogForm(false);
      await loadVisitLogs(logPetId);
    } catch (e: unknown) {
      setLogFormError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSavingLog(false);
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
            style={{ ...btnStyle, backgroundColor: "#4f8a6f", color: "#fff", borderColor: "#4f8a6f", marginLeft: "auto", padding: "0.3rem 0.7rem" }}
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
              <a
                href={`/?impersonate=true&clientName=${encodeURIComponent(selectedClient.name)}&staffName=${encodeURIComponent("Staff")}&reason=${encodeURIComponent(`Support view for ${selectedClient.name}`)}`}
                style={{ ...btnStyle, backgroundColor: "#fef3c7", color: "#92400e", borderColor: "#fde68a", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "0.3rem" }}
              >
                👁 View as Customer
              </a>
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
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "0.75rem" }}>
              {pets.map((p) => (
                <div key={p.id} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: "0.85rem", background: "#fff", boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <strong style={{ fontSize: 15 }}>{p.name}</strong>
                    <div style={{ display: "flex", gap: "0.3rem" }}>
                      <button onClick={() => openEditPet(p)} style={{ ...btnStyle, padding: "0.15rem 0.5rem", fontSize: 11 }}>Edit</button>
                      <button
                        onClick={() => openLogForm(p.id)}
                        style={{ ...btnStyle, padding: "0.15rem 0.5rem", fontSize: 11, backgroundColor: "#eff6ff", borderColor: "#bfdbfe" }}
                      >
                        Log visit
                      </button>
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

                  {/* Grooming preferences */}
                  {(p.cutStyle || p.shampooPreference || p.specialCareNotes || p.groomingNotes) && (
                    <div style={{ marginTop: "0.5rem", borderTop: "1px solid #f3f4f6", paddingTop: "0.4rem" }}>
                      {p.cutStyle && (
                        <div style={{ fontSize: 12, color: "#374151" }}>
                          <span style={{ fontWeight: 600 }}>Cut:</span> {p.cutStyle}
                        </div>
                      )}
                      {p.shampooPreference && (
                        <div style={{ fontSize: 12, color: "#374151" }}>
                          <span style={{ fontWeight: 600 }}>Shampoo:</span> {p.shampooPreference}
                        </div>
                      )}
                      {p.specialCareNotes && (
                        <div style={{ fontSize: 12, marginTop: "0.2rem", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 4, padding: "0.3rem 0.5rem", color: "#92400e" }}>
                          <span style={{ fontWeight: 600 }}>Special care:</span> {p.specialCareNotes}
                        </div>
                      )}
                      {p.groomingNotes && (
                        <div style={{ fontSize: 12, marginTop: "0.2rem", color: "#374151" }}>
                          <span style={{ fontWeight: 600 }}>Notes:</span> {p.groomingNotes}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Visit history (loaded on demand) */}
                  {(() => {
                    const logs = visitLogs[p.id];
                    if (!logs || logs.length === 0) return null;
                    return (
                      <div style={{ marginTop: "0.5rem", borderTop: "1px solid #f3f4f6", paddingTop: "0.4rem" }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", marginBottom: "0.25rem" }}>VISIT HISTORY</div>
                        {logs.slice(0, 3).map((log) => (
                          <div key={log.id} style={{ fontSize: 11, color: "#374151", marginBottom: "0.2rem", borderLeft: "2px solid #e2e8f0", paddingLeft: "0.4rem" }}>
                            <span style={{ color: "#6b7280" }}>{new Date(log.groomedAt).toLocaleDateString()}</span>
                            {log.cutStyle && <span> · {log.cutStyle}</span>}
                            {log.notes && <span> · {log.notes}</span>}
                          </div>
                        ))}
                        {logs.length > 3 && (
                          <div style={{ fontSize: 11, color: "#6b7280" }}>+{logs.length - 3} more visits</div>
                        )}
                      </div>
                    );
                  })()}
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
              <button type="submit" disabled={savingClient} style={{ ...btnStyle, backgroundColor: "#4f8a6f", color: "#fff", borderColor: "#4f8a6f" }}>
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
              <textarea
                value={petForm.healthAlerts}
                onChange={(e) => setPetForm((f) => ({ ...f, healthAlerts: e.target.value }))}
                rows={2}
                style={{ ...inputStyle, resize: "vertical", borderColor: petForm.healthAlerts ? "#fca5a5" : undefined }}
                placeholder="e.g. Allergic to lavender, heart condition, on medication X"
              />
            </Field>
            <div style={{ borderTop: "1px solid #e5e7eb", marginTop: "0.75rem", paddingTop: "0.75rem" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", marginBottom: "0.5rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Grooming Preferences
              </div>
              <Field label="Preferred cut style (optional)">
                <input
                  value={petForm.cutStyle}
                  onChange={(e) => setPetForm((f) => ({ ...f, cutStyle: e.target.value }))}
                  style={inputStyle}
                  placeholder="e.g. Puppy cut, Breed standard, Teddy bear"
                />
              </Field>
              <Field label="Shampoo / product preference (optional)">
                <input
                  value={petForm.shampooPreference}
                  onChange={(e) => setPetForm((f) => ({ ...f, shampooPreference: e.target.value }))}
                  style={inputStyle}
                  placeholder="e.g. Hypoallergenic, Oatmeal, Whitening"
                />
              </Field>
              <Field label="Special care instructions (optional)">
                <textarea
                  value={petForm.specialCareNotes}
                  onChange={(e) => setPetForm((f) => ({ ...f, specialCareNotes: e.target.value }))}
                  rows={2}
                  style={{ ...inputStyle, resize: "vertical" }}
                  placeholder="e.g. Needs a pee pad in pen, anxious around dryers, requires muzzle"
                />
              </Field>
              <Field label="General grooming notes (optional)">
                <textarea value={petForm.groomingNotes} onChange={(e) => setPetForm((f) => ({ ...f, groomingNotes: e.target.value }))} rows={2} style={{ ...inputStyle, resize: "vertical" }} />
              </Field>
            </div>
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

      {/* ── Visit log modal ── */}
      {showLogForm && logPetId && (
        <Modal onClose={() => setShowLogForm(false)}>
          <h2 style={{ marginTop: 0 }}>Log Grooming Visit</h2>
          {logsLoading[logPetId] && <p style={{ fontSize: 13, color: "#6b7280" }}>Loading history…</p>}
          {visitLogs[logPetId] && visitLogs[logPetId].length > 0 && (
            <div style={{ marginBottom: "1rem" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", marginBottom: "0.4rem", textTransform: "uppercase" }}>Past Visits</div>
              {visitLogs[logPetId].slice(0, 5).map((log) => (
                <div key={log.id} style={{ fontSize: 12, borderLeft: "2px solid #e2e8f0", paddingLeft: "0.5rem", marginBottom: "0.3rem", color: "#374151" }}>
                  <strong>{new Date(log.groomedAt).toLocaleDateString()}</strong>
                  {log.cutStyle && <span> · {log.cutStyle}</span>}
                  {log.productsUsed && <span> · {log.productsUsed}</span>}
                  {log.notes && <div style={{ color: "#6b7280" }}>{log.notes}</div>}
                </div>
              ))}
            </div>
          )}
          <form onSubmit={submitVisitLog}>
            <Field label="Date &amp; time">
              <input
                type="datetime-local"
                value={logForm.groomedAt}
                onChange={(e) => setLogForm((f) => ({ ...f, groomedAt: e.target.value }))}
                style={inputStyle}
                required
              />
            </Field>
            <Field label="Cut style (optional)">
              <input
                value={logForm.cutStyle}
                onChange={(e) => setLogForm((f) => ({ ...f, cutStyle: e.target.value }))}
                style={inputStyle}
                placeholder="e.g. Puppy cut, Kennel cut"
              />
            </Field>
            <Field label="Products used (optional)">
              <input
                value={logForm.productsUsed}
                onChange={(e) => setLogForm((f) => ({ ...f, productsUsed: e.target.value }))}
                style={inputStyle}
                placeholder="e.g. Oatmeal shampoo, leave-in conditioner"
              />
            </Field>
            <Field label="Notes (optional)">
              <textarea
                value={logForm.notes}
                onChange={(e) => setLogForm((f) => ({ ...f, notes: e.target.value }))}
                rows={3}
                style={{ ...inputStyle, resize: "vertical" }}
                placeholder="Anything notable about this visit"
              />
            </Field>
            {logFormError && <p style={{ color: "red", margin: "0.5rem 0 0" }}>{logFormError}</p>}
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
              <button type="submit" disabled={savingLog} style={{ ...btnStyle, backgroundColor: "#4f8a6f", color: "#fff", borderColor: "#4f8a6f" }}>
                {savingLog ? "Saving…" : "Save Visit Log"}
              </button>
              <button type="button" onClick={() => setShowLogForm(false)} style={btnStyle}>Cancel</button>
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
  padding: "0.4rem 0.85rem", border: "1px solid #d1d5db", borderRadius: 6, background: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 500,
};

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "0.45rem 0.6rem", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 14, boxSizing: "border-box",
};
