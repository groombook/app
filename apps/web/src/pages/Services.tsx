import { useEffect, useState } from "react";
import type { Service } from "@groombook/types";

export function ServicesPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/services")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<Service[]>;
      })
      .then(setServices)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Unknown error")
      )
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p>Loading services…</p>;
  if (error) return <p style={{ color: "red" }}>Error: {error}</p>;

  return (
    <div>
      <h1>Services</h1>
      {services.length === 0 ? (
        <p>No services configured yet.</p>
      ) : (
        <ul>
          {services.map((s) => (
            <li key={s.id}>
              {s.name} — ${(s.basePriceCents / 100).toFixed(2)} /{" "}
              {s.durationMinutes} min
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
