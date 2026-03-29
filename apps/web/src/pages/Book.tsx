import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { Service } from "@groombook/types";

// ─── Types ───────────────────────────────────────────────────────────────────

interface BookingBody {
  serviceId: string;
  startTime: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  petName: string;
  petSpecies: string;
  petBreed: string;
  notes: string;
}

interface BookingResult {
  appointment: { id: string; startTime: string; endTime: string };
  client: { id: string; name: string; email: string | null };
  pet: { id: string; name: string };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function fmtDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function fmtDateLong(isoDate: string): string {
  const d = new Date(isoDate + "T12:00:00Z");
  return d.toLocaleDateString([], { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StepIndicator({ step }: { step: number }) {
  const steps = ["Service", "Date & Time", "Your Info", "Confirm"];
  return (
    <div style={{ display: "flex", gap: 0, marginBottom: "1.5rem" }}>
      {steps.map((label, i) => {
        const idx = i + 1;
        const active = idx === step;
        const done = idx < step;
        return (
          <div
            key={label}
            style={{
              flex: 1,
              textAlign: "center",
              padding: "0.5rem 0.25rem",
              fontSize: 12,
              fontWeight: active ? 700 : 400,
              color: active ? "var(--color-primary)" : done ? "var(--color-primary)" : "#9ca3af",
              borderBottom: `3px solid ${active ? "var(--color-primary)" : done ? "var(--color-primary)" : "#e5e7eb"}`,
            }}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 22,
                height: 22,
                borderRadius: "50%",
                background: active ? "var(--color-primary)" : done ? "var(--color-primary)" : "#e5e7eb",
                color: active || done ? "#fff" : "#6b7280",
                fontSize: 12,
                fontWeight: 700,
                marginRight: 4,
              }}
            >
              {done ? "✓" : idx}
            </span>
            {label}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function BookPage() {
  const [step, setStep] = useState(1);

  // Step 1 — service
  const [services, setServices] = useState<Service[]>([]);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [selectedService, setSelectedService] = useState<Service | null>(null);

  // Step 2 — date & time
  const [date, setDate] = useState(todayIso());
  const [slots, setSlots] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

  // Step 3 — contact info
  const [form, setForm] = useState<BookingBody>({
    serviceId: "",
    startTime: "",
    clientName: "",
    clientEmail: "",
    clientPhone: "",
    petName: "",
    petSpecies: "",
    petBreed: "",
    notes: "",
  });
  const [formError, setFormError] = useState<string | null>(null);

  // Pre-fill form from URL params (e.g., ?clientName=Jane&clientEmail=jane@example.com)
  const [searchParams] = useSearchParams();
  useEffect(() => {
    const clientName = searchParams.get("clientName");
    const clientEmail = searchParams.get("clientEmail");
    const clientPhone = searchParams.get("clientPhone");
    const petName = searchParams.get("petName");
    const petSpecies = searchParams.get("petSpecies");
    const petBreed = searchParams.get("petBreed");
    if (clientName || clientEmail || clientPhone || petName || petSpecies || petBreed) {
      setForm((f) => ({
        ...f,
        ...(clientName && { clientName }),
        ...(clientEmail && { clientEmail }),
        ...(clientPhone && { clientPhone }),
        ...(petName && { petName }),
        ...(petSpecies && { petSpecies }),
        ...(petBreed && { petBreed }),
      }));
    }
  }, [searchParams]);

  // Step 4 — result
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<BookingResult | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Load services on mount
  useEffect(() => {
    fetch("/api/book/services")
      .then((r) => r.json() as Promise<Service[]>)
      .then(setServices)
      .catch(() => setServices([]))
      .finally(() => setServicesLoading(false));
  }, []);

  // Load slots when service or date changes (step 2)
  useEffect(() => {
    if (!selectedService || !date) return;
    setSlotsLoading(true);
    setSelectedSlot(null);
    fetch(
      `/api/book/availability?serviceId=${encodeURIComponent(selectedService.id)}&date=${encodeURIComponent(date)}`
    )
      .then((r) => r.json() as Promise<string[]>)
      .then(setSlots)
      .catch(() => setSlots([]))
      .finally(() => setSlotsLoading(false));
  }, [selectedService, date]);

  function goToStep2(svc: Service) {
    setSelectedService(svc);
    setForm((f) => ({ ...f, serviceId: svc.id }));
    setStep(2);
  }

  function goToStep3() {
    if (!selectedSlot) return;
    setForm((f) => ({ ...f, startTime: selectedSlot }));
    setStep(3);
  }

  function goToStep4() {
    if (!form.clientName.trim() || !form.clientEmail.trim() || !form.petName.trim() || !form.petSpecies.trim()) {
      setFormError("Please fill in all required fields.");
      return;
    }
    setFormError(null);
    setStep(4);
  }

  async function submitBooking() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/book/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId: form.serviceId,
          startTime: form.startTime,
          clientName: form.clientName,
          clientEmail: form.clientEmail,
          clientPhone: form.clientPhone || undefined,
          petName: form.petName,
          petSpecies: form.petSpecies,
          petBreed: form.petBreed || undefined,
          notes: form.notes || undefined,
        }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as BookingResult;
      setResult(data);
      setStep(5);
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Styles ──
  const card: React.CSSProperties = {
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 8,
    padding: "1rem",
    cursor: "pointer",
  };

  const selectedCard: React.CSSProperties = {
    ...card,
    border: "2px solid var(--color-primary)",
    background: "#f0faf5",
  };

  const input: React.CSSProperties = {
    width: "100%",
    padding: "0.5rem 0.75rem",
    border: "1px solid #d1d5db",
    borderRadius: 6,
    fontSize: 14,
    boxSizing: "border-box",
  };

  const label: React.CSSProperties = {
    display: "block",
    fontSize: 13,
    fontWeight: 600,
    color: "#374151",
    marginBottom: 4,
  };

  const btn: React.CSSProperties = {
    padding: "0.6rem 1.25rem",
    borderRadius: 6,
    border: "none",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 600,
  };

  const primaryBtn: React.CSSProperties = {
    ...btn,
    background: "var(--color-primary)",
    color: "#fff",
  };

  const secondaryBtn: React.CSSProperties = {
    ...btn,
    background: "#f3f4f6",
    color: "#374151",
  };

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "1rem" }}>
      <div style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "#1f2937", margin: 0 }}>
          Book an Appointment
        </h1>
        <p style={{ fontSize: 14, color: "#6b7280", marginTop: 4 }}>
          Schedule a grooming appointment for your pet in minutes.
        </p>
      </div>

      {step < 5 && <StepIndicator step={step} />}

      {/* ── Step 1: Select Service ── */}
      {step === 1 && (
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: "0.75rem" }}>
            Choose a service
          </h2>
          {servicesLoading && <p style={{ color: "#6b7280" }}>Loading services…</p>}
          {!servicesLoading && services.length === 0 && (
            <p style={{ color: "#ef4444" }}>No services available. Please contact us to book.</p>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {services.map((svc) => (
              <div
                key={svc.id}
                style={selectedService?.id === svc.id ? selectedCard : card}
                onClick={() => goToStep2(svc)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && goToStep2(svc)}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 15, color: "#1f2937" }}>{svc.name}</div>
                    {svc.description && (
                      <div style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>{svc.description}</div>
                    )}
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0, marginLeft: "1rem" }}>
                    <div style={{ fontWeight: 700, color: "var(--color-primary)", fontSize: 15 }}>
                      {fmtPrice(svc.basePriceCents)}
                    </div>
                    <div style={{ fontSize: 12, color: "#9ca3af" }}>{fmtDuration(svc.durationMinutes)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Step 2: Date & Time ── */}
      {step === 2 && selectedService && (
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Choose a date and time</h2>
          <p style={{ fontSize: 13, color: "#6b7280", marginBottom: "1rem" }}>
            {selectedService.name} — {fmtDuration(selectedService.durationMinutes)} — {fmtPrice(selectedService.basePriceCents)}
          </p>

          <div style={{ marginBottom: "1rem" }}>
            <label style={label}>Date</label>
            <input
              type="date"
              value={date}
              min={todayIso()}
              style={{ ...input, width: "auto" }}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div style={{ marginBottom: "1.25rem" }}>
            <label style={label}>Available times on {fmtDateLong(date)}</label>
            {slotsLoading && <p style={{ color: "#6b7280", fontSize: 13 }}>Checking availability…</p>}
            {!slotsLoading && slots.length === 0 && (
              <p style={{ color: "#6b7280", fontSize: 13 }}>
                No available slots on this date. Please try another day.
              </p>
            )}
            {!slotsLoading && slots.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "0.5rem" }}>
                {slots.map((slot) => (
                  <button
                    key={slot}
                    onClick={() => setSelectedSlot(slot)}
                    style={{
                      padding: "0.4rem 0.85rem",
                      borderRadius: 6,
                      border: `2px solid ${selectedSlot === slot ? "var(--color-primary)" : "#d1d5db"}`,
                      background: selectedSlot === slot ? "var(--color-primary)" : "#fff",
                      color: selectedSlot === slot ? "#fff" : "#374151",
                      fontSize: 13,
                      fontWeight: 500,
                      cursor: "pointer",
                    }}
                  >
                    {fmtTime(slot)}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: "0.75rem" }}>
            <button style={secondaryBtn} onClick={() => setStep(1)}>Back</button>
            <button
              style={{ ...primaryBtn, opacity: selectedSlot ? 1 : 0.5 }}
              disabled={!selectedSlot}
              onClick={goToStep3}
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Contact Info ── */}
      {step === 3 && (
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: "1rem" }}>Your information</h2>

          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <fieldset style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "0.75rem 1rem" }}>
              <legend style={{ fontSize: 13, fontWeight: 600, color: "#374151", padding: "0 0.25rem" }}>
                Contact details
              </legend>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <div>
                  <label style={label}>Full name *</label>
                  <input
                    style={input}
                    value={form.clientName}
                    onChange={(e) => setForm((f) => ({ ...f, clientName: e.target.value }))}
                    placeholder="Jane Smith"
                  />
                </div>
                <div>
                  <label style={label}>Email *</label>
                  <input
                    type="email"
                    style={input}
                    value={form.clientEmail}
                    onChange={(e) => setForm((f) => ({ ...f, clientEmail: e.target.value }))}
                    placeholder="jane@example.com"
                  />
                </div>
                <div>
                  <label style={label}>Phone</label>
                  <input
                    type="tel"
                    style={input}
                    value={form.clientPhone}
                    onChange={(e) => setForm((f) => ({ ...f, clientPhone: e.target.value }))}
                    placeholder="(555) 000-1234"
                  />
                </div>
              </div>
            </fieldset>

            <fieldset style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "0.75rem 1rem" }}>
              <legend style={{ fontSize: 13, fontWeight: 600, color: "#374151", padding: "0 0.25rem" }}>
                Pet details
              </legend>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <div>
                  <label style={label}>Pet name *</label>
                  <input
                    style={input}
                    value={form.petName}
                    onChange={(e) => setForm((f) => ({ ...f, petName: e.target.value }))}
                    placeholder="Buddy"
                  />
                </div>
                <div>
                  <label style={label}>Species *</label>
                  <select
                    style={input}
                    value={form.petSpecies}
                    onChange={(e) => setForm((f) => ({ ...f, petSpecies: e.target.value }))}
                  >
                    <option value="">Select species…</option>
                    <option value="dog">Dog</option>
                    <option value="cat">Cat</option>
                    <option value="rabbit">Rabbit</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label style={label}>Breed</label>
                  <input
                    style={input}
                    value={form.petBreed}
                    onChange={(e) => setForm((f) => ({ ...f, petBreed: e.target.value }))}
                    placeholder="Golden Retriever"
                  />
                </div>
                <div>
                  <label style={label}>Notes for groomer</label>
                  <textarea
                    style={{ ...input, minHeight: 64, resize: "vertical", fontFamily: "inherit" }}
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    placeholder="Any special requests or things we should know…"
                  />
                </div>
              </div>
            </fieldset>
          </div>

          {formError && (
            <p style={{ color: "#ef4444", fontSize: 13, marginTop: "0.75rem" }}>{formError}</p>
          )}

          <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.25rem" }}>
            <button style={secondaryBtn} onClick={() => setStep(2)}>Back</button>
            <button style={primaryBtn} onClick={goToStep4}>Review booking</button>
          </div>
        </div>
      )}

      {/* ── Step 4: Confirm ── */}
      {step === 4 && selectedService && selectedSlot && (
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: "1rem" }}>Confirm your booking</h2>

          <div style={{ ...card, cursor: "default", marginBottom: "1.25rem" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", fontSize: 14 }}>
              <div>
                <div style={{ color: "#9ca3af", fontSize: 12, fontWeight: 600, textTransform: "uppercase" }}>Service</div>
                <div style={{ fontWeight: 600 }}>{selectedService.name}</div>
                <div style={{ color: "#6b7280" }}>{fmtPrice(selectedService.basePriceCents)} · {fmtDuration(selectedService.durationMinutes)}</div>
              </div>
              <div>
                <div style={{ color: "#9ca3af", fontSize: 12, fontWeight: 600, textTransform: "uppercase" }}>Date & Time</div>
                <div style={{ fontWeight: 600 }}>{fmtDateLong(date)}</div>
                <div style={{ color: "#6b7280" }}>{fmtTime(selectedSlot)}</div>
              </div>
              <div>
                <div style={{ color: "#9ca3af", fontSize: 12, fontWeight: 600, textTransform: "uppercase" }}>Client</div>
                <div style={{ fontWeight: 600 }}>{form.clientName}</div>
                <div style={{ color: "#6b7280" }}>{form.clientEmail}</div>
                {form.clientPhone && <div style={{ color: "#6b7280" }}>{form.clientPhone}</div>}
              </div>
              <div>
                <div style={{ color: "#9ca3af", fontSize: 12, fontWeight: 600, textTransform: "uppercase" }}>Pet</div>
                <div style={{ fontWeight: 600 }}>{form.petName}</div>
                <div style={{ color: "#6b7280", textTransform: "capitalize" }}>{form.petSpecies}{form.petBreed ? ` · ${form.petBreed}` : ""}</div>
              </div>
              {form.notes && (
                <div style={{ gridColumn: "1 / -1" }}>
                  <div style={{ color: "#9ca3af", fontSize: 12, fontWeight: 600, textTransform: "uppercase" }}>Notes</div>
                  <div style={{ color: "#374151" }}>{form.notes}</div>
                </div>
              )}
            </div>
          </div>

          {submitError && (
            <p style={{ color: "#ef4444", fontSize: 13, marginBottom: "0.75rem" }}>{submitError}</p>
          )}

          <div style={{ display: "flex", gap: "0.75rem" }}>
            <button style={secondaryBtn} onClick={() => setStep(3)} disabled={submitting}>Back</button>
            <button
              style={{ ...primaryBtn, opacity: submitting ? 0.7 : 1 }}
              onClick={submitBooking}
              disabled={submitting}
            >
              {submitting ? "Booking…" : "Confirm booking"}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 5: Success ── */}
      {step === 5 && result && (
        <div style={{ textAlign: "center", padding: "2rem 1rem" }}>
          <div style={{ fontSize: 48, marginBottom: "0.75rem" }}>🐾</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "#1f2937", marginBottom: "0.5rem" }}>
            Booking confirmed!
          </h2>
          <p style={{ color: "#6b7280", fontSize: 14, marginBottom: "1.5rem" }}>
            We&apos;ve booked {result.pet.name} in for{" "}
            {selectedService?.name} on {fmtDateLong(date)} at{" "}
            {fmtTime(result.appointment.startTime)}.
          </p>
          <div style={{ ...card, cursor: "default", textAlign: "left", marginBottom: "1.5rem" }}>
            <p style={{ margin: 0, fontSize: 14, color: "#374151" }}>
              A confirmation will be sent to <strong>{result.client.email}</strong>.
              If you need to reschedule or cancel, please contact us.
            </p>
          </div>
          <button
            style={primaryBtn}
            onClick={() => {
              setStep(1);
              setSelectedService(null);
              setSelectedSlot(null);
              setResult(null);
              setForm({
                serviceId: "", startTime: "", clientName: "", clientEmail: "",
                clientPhone: "", petName: "", petSpecies: "", petBreed: "", notes: "",
              });
            }}
          >
            Book another appointment
          </button>
        </div>
      )}
    </div>
  );
}
