import { useEffect, useState } from "react";
import type { Client } from "@groombook/types";

export function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/clients")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<Client[]>;
      })
      .then(setClients)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Unknown error")
      )
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p>Loading clients…</p>;
  if (error) return <p style={{ color: "red" }}>Error: {error}</p>;

  return (
    <div>
      <h1>Clients</h1>
      {clients.length === 0 ? (
        <p>No clients yet.</p>
      ) : (
        <ul>
          {clients.map((c) => (
            <li key={c.id}>
              {c.name} {c.email ? `— ${c.email}` : ""}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
