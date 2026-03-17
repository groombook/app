import { useEffect, useState } from "react";
import type { Appointment } from "@groombook/types";

export function AppointmentsPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/appointments")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<Appointment[]>;
      })
      .then(setAppointments)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Unknown error")
      )
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p>Loading appointments…</p>;
  if (error) return <p style={{ color: "red" }}>Error: {error}</p>;

  return (
    <div>
      <h1>Appointments</h1>
      {appointments.length === 0 ? (
        <p>No appointments yet.</p>
      ) : (
        <ul>
          {appointments.map((a) => (
            <li key={a.id}>
              {new Date(a.startTime).toLocaleString()} — {a.status}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
