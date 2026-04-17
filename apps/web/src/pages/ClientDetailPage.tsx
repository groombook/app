import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import type { Client, GroomingVisitLog, Pet } from "@groombook/types";
import { PetPhotoDisplay } from "../components/PetPhotoDisplay.js";
import { PetPhotoUpload } from "../components/PetPhotoUpload.js";

export function ClientDetailPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const [client, setClient] = useState<Client | null>(null);
  const [pets, setPets] = useState<Pet[]>([]);
  const [visitLogs, setVisitLogs] = useState<Record<string, GroomingVisitLog[]>>({});
  const [logsLoading, setLogsLoading] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [photoRevisions, setPhotoRevisions] = useState<Record<string, number>>({});

  const handlePhotoUploaded = useCallback((petId: string) => {
    setPhotoRevisions((prev) => ({ ...prev, [petId]: (prev[petId] ?? 0) + 1 }));
  }, []);

  useEffect(() => {
    if (!clientId) {
      setError("No client ID provided");
      setLoading(false);
      return;
    }

    async function load() {
      const id = clientId!;
      setLoading(true);
      setError(null);
      try {
        const [clientRes, petsRes] = await Promise.all([
          fetch(`/api/clients/${encodeURIComponent(id)}`),
          fetch(`/api/pets?clientId=${encodeURIComponent(id)}`),
        ]);

        if (!clientRes.ok) {
          const err = await clientRes.json().catch(() => ({})) as { error?: string };
          throw new Error(err.error ?? `Client fetch failed: ${clientRes.status}`);
        }
        if (!petsRes.ok) {
          throw new Error(`Pets fetch failed: ${petsRes.status}`);
        }

        setClient(await clientRes.json() as Client);
        setPets(await petsRes.json() as Pet[]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load client");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [clientId]);

  async function loadVisitLogs(petId: string) {
    setLogsLoading((prev) => ({ ...prev, [petId]: true }));
    const r = await fetch(`/api/grooming-logs?petId=${encodeURIComponent(petId)}`);
    if (r.ok) {
      const logs = await r.json() as GroomingVisitLog[];
      setVisitLogs((prev) => ({ ...prev, [petId]: logs }));
    }
    setLogsLoading((prev) => ({ ...prev, [petId]: false }));
  }

  if (loading) {
    return (
      <div style={{ padding: "2rem", textAlign: "center", color: "#6b7280", fontFamily: "system-ui, sans-serif" }}>
        Loading client…
      </div>
    );
  }

  if (error || !client) {
    return (
      <div style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ marginBottom: "1rem" }}>
          <Link to="/admin/clients" style={{ color: "#4f8a6f", fontSize: 13 }}>← Back to clients</Link>
        </div>
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "1rem", color: "#991b1b" }}>
          {error ?? "Client not found"}
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", marginBottom: "1.5rem", gap: "1rem" }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.25rem" }}>
            <h1 style={{ margin: 0, fontSize: 22 }}>{client.name}</h1>
            {client.status === "disabled" && (
              <span style={{ fontSize: 12, background: "#fef2f2", color: "#dc2626", padding: "0.15rem 0.5rem", borderRadius: 4, fontWeight: 500 }}>
                Disabled
              </span>
            )}
          </div>
          {client.email && <div style={{ fontSize: 14, color: "#6b7280" }}>{client.email}</div>}
          {client.phone && <div style={{ fontSize: 14, color: "#6b7280" }}>{client.phone}</div>}
          {client.address && <div style={{ fontSize: 13, color: "#6b7280" }}>{client.address}</div>}
          {client.notes && (
            <div style={{ fontSize: 13, marginTop: "0.4rem", background: "#fef9c3", padding: "0.4rem 0.6rem", borderRadius: 4, maxWidth: 500 }}>
              {client.notes}
            </div>
          )}
        </div>
        <Link
          to="/admin/clients"
          style={{
            padding: "0.4rem 0.85rem",
            border: "1px solid #d1d5db",
            borderRadius: 6,
            background: "#fff",
            color: "#374151",
            fontSize: 13,
            fontWeight: 500,
            textDecoration: "none",
            flexShrink: 0,
          }}
        >
          ← Back to list
        </Link>
      </div>

      {/* Pets */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem" }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Pets</h2>
      </div>

      {pets.length === 0 ? (
        <p style={{ color: "#6b7280", fontSize: 14 }}>No pets on file for this client.</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "0.75rem" }}>
          {pets.map((p) => (
            <div key={p.id} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: "0.85rem", background: "#fff", boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)" }}>
              {/* Photo + header */}
              <div style={{ display: "flex", gap: "0.75rem", marginBottom: "0.4rem" }}>
                <PetPhotoDisplay
                  petId={p.id}
                  size={56}
                  key={`${p.id}-photo-${photoRevisions[p.id] ?? 0}`}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <strong style={{ fontSize: 15 }}>{p.name}</strong>
                  </div>
                  <div style={{ fontSize: 13, color: "#6b7280", marginTop: "0.15rem" }}>
                    {p.species}{p.breed ? ` · ${p.breed}` : ""}
                  </div>
                  {p.weightKg != null && <div style={{ fontSize: 12, color: "#6b7280" }}>{p.weightKg} kg</div>}
                  {p.dateOfBirth && <div style={{ fontSize: 12, color: "#6b7280" }}>Born {new Date(p.dateOfBirth).toLocaleDateString()}</div>}
                  <div style={{ marginTop: "0.3rem" }}>
                    <PetPhotoUpload petId={p.id} onUploaded={() => handlePhotoUploaded(p.id)} />
                  </div>
                </div>
              </div>

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

              {/* Visit history */}
              {(() => {
                const logs = visitLogs[p.id];
                const loadingLogs = logsLoading[p.id];
                return (
                  <div style={{ marginTop: "0.5rem", borderTop: "1px solid #f3f4f6", paddingTop: "0.4rem" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.25rem" }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "#6b7280" }}>VISIT HISTORY</div>
                      {!logs && !loadingLogs && (
                        <button
                          onClick={() => { void loadVisitLogs(p.id); }}
                          style={{ fontSize: 11, color: "#4f8a6f", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                        >
                          Load history
                        </button>
                      )}
                    </div>
                    {loadingLogs && <div style={{ fontSize: 11, color: "#9ca3af" }}>Loading…</div>}
                    {logs && logs.length === 0 && <div style={{ fontSize: 11, color: "#9ca3af" }}>No visits yet</div>}
                    {logs && logs.length > 0 && (
                      <>
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
                      </>
                    )}
                  </div>
                );
              })()}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
