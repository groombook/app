import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtPrice(cents) {
    return `$${(cents / 100).toFixed(2)}`;
}
function fmtDuration(minutes) {
    if (minutes < 60)
        return `${minutes} min`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
}
function fmtTime(iso) {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function fmtDateLong(isoDate) {
    const d = new Date(isoDate + "T12:00:00Z");
    return d.toLocaleDateString([], { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}
function todayIso() {
    return new Date().toISOString().slice(0, 10);
}
// ─── Sub-components ───────────────────────────────────────────────────────────
function StepIndicator({ step }) {
    const steps = ["Service", "Date & Time", "Your Info", "Confirm"];
    return (_jsx("div", { style: { display: "flex", gap: 0, marginBottom: "1.5rem" }, children: steps.map((label, i) => {
            const idx = i + 1;
            const active = idx === step;
            const done = idx < step;
            return (_jsxs("div", { style: {
                    flex: 1,
                    textAlign: "center",
                    padding: "0.5rem 0.25rem",
                    fontSize: 12,
                    fontWeight: active ? 700 : 400,
                    color: active ? "var(--color-primary)" : done ? "var(--color-primary)" : "#9ca3af",
                    borderBottom: `3px solid ${active ? "var(--color-primary)" : done ? "var(--color-primary)" : "#e5e7eb"}`,
                }, children: [_jsx("span", { style: {
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
                        }, children: done ? "✓" : idx }), label] }, label));
        }) }));
}
// ─── Main Component ───────────────────────────────────────────────────────────
export function BookPage() {
    const [step, setStep] = useState(1);
    // Step 1 — service
    const [services, setServices] = useState([]);
    const [servicesLoading, setServicesLoading] = useState(true);
    const [selectedService, setSelectedService] = useState(null);
    // Step 2 — date & time
    const [date, setDate] = useState(todayIso());
    const [dateError, setDateError] = useState(null);
    const [slots, setSlots] = useState([]);
    const [slotsLoading, setSlotsLoading] = useState(false);
    const [selectedSlot, setSelectedSlot] = useState(null);
    // Step 3 — contact info
    const [form, setForm] = useState({
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
    const [formError, setFormError] = useState(null);
    // Step 4 — result
    const [submitting, setSubmitting] = useState(false);
    const [result, setResult] = useState(null);
    const [submitError, setSubmitError] = useState(null);
    // Load services on mount
    useEffect(() => {
        fetch("/api/book/services")
            .then((r) => r.json())
            .then(setServices)
            .catch(() => setServices([]))
            .finally(() => setServicesLoading(false));
    }, []);
    // Load slots when service or date changes (step 2)
    useEffect(() => {
        if (!selectedService || !date)
            return;
        setSlotsLoading(true);
        setSelectedSlot(null);
        fetch(`/api/book/availability?serviceId=${encodeURIComponent(selectedService.id)}&date=${encodeURIComponent(date)}`)
            .then((r) => r.json())
            .then(setSlots)
            .catch(() => setSlots([]))
            .finally(() => setSlotsLoading(false));
    }, [selectedService, date]);
    function goToStep2(svc) {
        setSelectedService(svc);
        setForm((f) => ({ ...f, serviceId: svc.id }));
        setDateError(null);
        setStep(2);
    }
    function goToStep3() {
        if (!selectedSlot)
            return;
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
                const body = (await res.json());
                throw new Error(body.error ?? `HTTP ${res.status}`);
            }
            const data = (await res.json());
            setResult(data);
            setStep(5);
        }
        catch (e) {
            setSubmitError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
        }
        finally {
            setSubmitting(false);
        }
    }
    // ── Styles ──
    const card = {
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        padding: "1rem",
        cursor: "pointer",
    };
    const selectedCard = {
        ...card,
        border: "2px solid var(--color-primary)",
        background: "#f0faf5",
    };
    const input = {
        width: "100%",
        padding: "0.5rem 0.75rem",
        border: "1px solid #d1d5db",
        borderRadius: 6,
        fontSize: 14,
        boxSizing: "border-box",
    };
    const label = {
        display: "block",
        fontSize: 13,
        fontWeight: 600,
        color: "#374151",
        marginBottom: 4,
    };
    const btn = {
        padding: "0.6rem 1.25rem",
        borderRadius: 6,
        border: "none",
        cursor: "pointer",
        fontSize: 14,
        fontWeight: 600,
    };
    const primaryBtn = {
        ...btn,
        background: "var(--color-primary)",
        color: "#fff",
    };
    const secondaryBtn = {
        ...btn,
        background: "#f3f4f6",
        color: "#374151",
    };
    return (_jsxs("div", { style: { maxWidth: 640, margin: "0 auto", padding: "1rem" }, children: [_jsxs("div", { style: { marginBottom: "1.5rem" }, children: [_jsx("h1", { style: { fontSize: 24, fontWeight: 700, color: "#1f2937", margin: 0 }, children: "Book an Appointment" }), _jsx("p", { style: { fontSize: 14, color: "#6b7280", marginTop: 4 }, children: "Schedule a grooming appointment for your pet in minutes." })] }), step < 5 && _jsx(StepIndicator, { step: step }), step === 1 && (_jsxs("div", { children: [_jsx("h2", { style: { fontSize: 16, fontWeight: 600, marginBottom: "0.75rem" }, children: "Choose a service" }), servicesLoading && _jsx("p", { style: { color: "#6b7280" }, children: "Loading services\u2026" }), !servicesLoading && services.length === 0 && (_jsx("p", { style: { color: "#ef4444" }, children: "No services available. Please contact us to book." })), _jsx("div", { style: { display: "flex", flexDirection: "column", gap: "0.75rem" }, children: services.map((svc) => (_jsx("div", { style: selectedService?.id === svc.id ? selectedCard : card, onClick: () => goToStep2(svc), role: "button", tabIndex: 0, onKeyDown: (e) => e.key === "Enter" && goToStep2(svc), children: _jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" }, children: [_jsxs("div", { children: [_jsx("div", { style: { fontWeight: 600, fontSize: 15, color: "#1f2937" }, children: svc.name }), svc.description && (_jsx("div", { style: { fontSize: 13, color: "#6b7280", marginTop: 2 }, children: svc.description }))] }), _jsxs("div", { style: { textAlign: "right", flexShrink: 0, marginLeft: "1rem" }, children: [_jsx("div", { style: { fontWeight: 700, color: "var(--color-primary)", fontSize: 15 }, children: fmtPrice(svc.basePriceCents) }), _jsx("div", { style: { fontSize: 12, color: "#9ca3af" }, children: fmtDuration(svc.durationMinutes) })] })] }) }, svc.id))) })] })), step === 2 && selectedService && (_jsxs("div", { children: [_jsx("h2", { style: { fontSize: 16, fontWeight: 600, marginBottom: 4 }, children: "Choose a date and time" }), _jsxs("p", { style: { fontSize: 13, color: "#6b7280", marginBottom: "1rem" }, children: [selectedService.name, " \u2014 ", fmtDuration(selectedService.durationMinutes), " \u2014 ", fmtPrice(selectedService.basePriceCents)] }), _jsxs("div", { style: { marginBottom: "1rem" }, children: [_jsx("label", { style: label, children: "Date" }), _jsx("input", { type: "date", value: date, min: todayIso(), style: { ...input, width: "auto" }, onChange: (e) => {
                const val = e.target.value;
                if (val && !/^\d{4}-\d{2}-\d{2}$/.test(val)) {
                    setDateError("Please enter a date in YYYY-MM-DD format.");
                    return;
                }
                setDateError(null);
                setDate(val);
            } }), dateError && _jsx("p", { style: { color: "#ef4444", fontSize: 12, marginTop: 4 }, children: dateError })] }), _jsxs("div", { style: { marginBottom: "1.25rem" }, children: [_jsxs("label", { style: label, children: ["Available times on ", fmtDateLong(date)] }), slotsLoading && _jsx("p", { style: { color: "#6b7280", fontSize: 13 }, children: "Checking availability\u2026" }), !slotsLoading && slots.length === 0 && (_jsx("p", { style: { color: "#6b7280", fontSize: 13 }, children: "No available slots on this date. Please try another day." })), !slotsLoading && slots.length > 0 && (_jsx("div", { style: { display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "0.5rem" }, children: slots.map((slot) => (_jsx("button", { onClick: () => setSelectedSlot(slot), style: {
                                        padding: "0.4rem 0.85rem",
                                        borderRadius: 6,
                                        border: `2px solid ${selectedSlot === slot ? "var(--color-primary)" : "#d1d5db"}`,
                                        background: selectedSlot === slot ? "var(--color-primary)" : "#fff",
                                        color: selectedSlot === slot ? "#fff" : "#374151",
                                        fontSize: 13,
                                        fontWeight: 500,
                                        cursor: "pointer",
                                    }, children: fmtTime(slot) }, slot))) }))] }), _jsxs("div", { style: { display: "flex", gap: "0.75rem" }, children: [_jsx("button", { style: secondaryBtn, onClick: () => setStep(1), children: "Back" }), _jsx("button", { style: { ...primaryBtn, opacity: selectedSlot ? 1 : 0.5 }, disabled: !selectedSlot, onClick: goToStep3, children: "Continue" })] })] })), step === 3 && (_jsxs("div", { children: [_jsx("h2", { style: { fontSize: 16, fontWeight: 600, marginBottom: "1rem" }, children: "Your information" }), _jsxs("div", { style: { display: "flex", flexDirection: "column", gap: "1rem" }, children: [_jsxs("fieldset", { style: { border: "1px solid #e5e7eb", borderRadius: 8, padding: "0.75rem 1rem" }, children: [_jsx("legend", { style: { fontSize: 13, fontWeight: 600, color: "#374151", padding: "0 0.25rem" }, children: "Contact details" }), _jsxs("div", { style: { display: "flex", flexDirection: "column", gap: "0.75rem" }, children: [_jsxs("div", { children: [_jsx("label", { style: label, children: "Full name *" }), _jsx("input", { style: input, value: form.clientName, onChange: (e) => setForm((f) => ({ ...f, clientName: e.target.value })), placeholder: "Jane Smith" })] }), _jsxs("div", { children: [_jsx("label", { style: label, children: "Email *" }), _jsx("input", { type: "email", style: input, value: form.clientEmail, onChange: (e) => setForm((f) => ({ ...f, clientEmail: e.target.value })), placeholder: "jane@example.com" })] }), _jsxs("div", { children: [_jsx("label", { style: label, children: "Phone" }), _jsx("input", { type: "tel", style: input, value: form.clientPhone, onChange: (e) => setForm((f) => ({ ...f, clientPhone: e.target.value })), placeholder: "(555) 000-1234" })] })] })] }), _jsxs("fieldset", { style: { border: "1px solid #e5e7eb", borderRadius: 8, padding: "0.75rem 1rem" }, children: [_jsx("legend", { style: { fontSize: 13, fontWeight: 600, color: "#374151", padding: "0 0.25rem" }, children: "Pet details" }), _jsxs("div", { style: { display: "flex", flexDirection: "column", gap: "0.75rem" }, children: [_jsxs("div", { children: [_jsx("label", { style: label, children: "Pet name *" }), _jsx("input", { style: input, value: form.petName, onChange: (e) => setForm((f) => ({ ...f, petName: e.target.value })), placeholder: "Buddy" })] }), _jsxs("div", { children: [_jsx("label", { style: label, children: "Species *" }), _jsxs("select", { style: input, value: form.petSpecies, onChange: (e) => setForm((f) => ({ ...f, petSpecies: e.target.value })), children: [_jsx("option", { value: "", children: "Select species\u2026" }), _jsx("option", { value: "dog", children: "Dog" }), _jsx("option", { value: "cat", children: "Cat" }), _jsx("option", { value: "rabbit", children: "Rabbit" }), _jsx("option", { value: "other", children: "Other" })] })] }), _jsxs("div", { children: [_jsx("label", { style: label, children: "Breed" }), _jsx("input", { style: input, value: form.petBreed, onChange: (e) => setForm((f) => ({ ...f, petBreed: e.target.value })), placeholder: "Golden Retriever" })] }), _jsxs("div", { children: [_jsx("label", { style: label, children: "Notes for groomer" }), _jsx("textarea", { style: { ...input, minHeight: 64, resize: "vertical", fontFamily: "inherit" }, value: form.notes, onChange: (e) => setForm((f) => ({ ...f, notes: e.target.value })), placeholder: "Any special requests or things we should know\u2026" })] })] })] })] }), formError && (_jsx("p", { style: { color: "#ef4444", fontSize: 13, marginTop: "0.75rem" }, children: formError })), _jsxs("div", { style: { display: "flex", gap: "0.75rem", marginTop: "1.25rem" }, children: [_jsx("button", { style: secondaryBtn, onClick: () => setStep(2), children: "Back" }), _jsx("button", { style: primaryBtn, onClick: goToStep4, children: "Review booking" })] })] })), step === 4 && selectedService && selectedSlot && (_jsxs("div", { children: [_jsx("h2", { style: { fontSize: 16, fontWeight: 600, marginBottom: "1rem" }, children: "Confirm your booking" }), _jsx("div", { style: { ...card, cursor: "default", marginBottom: "1.25rem" }, children: _jsxs("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", fontSize: 14 }, children: [_jsxs("div", { children: [_jsx("div", { style: { color: "#9ca3af", fontSize: 12, fontWeight: 600, textTransform: "uppercase" }, children: "Service" }), _jsx("div", { style: { fontWeight: 600 }, children: selectedService.name }), _jsxs("div", { style: { color: "#6b7280" }, children: [fmtPrice(selectedService.basePriceCents), " \u00B7 ", fmtDuration(selectedService.durationMinutes)] })] }), _jsxs("div", { children: [_jsx("div", { style: { color: "#9ca3af", fontSize: 12, fontWeight: 600, textTransform: "uppercase" }, children: "Date & Time" }), _jsx("div", { style: { fontWeight: 600 }, children: fmtDateLong(date) }), _jsx("div", { style: { color: "#6b7280" }, children: fmtTime(selectedSlot) })] }), _jsxs("div", { children: [_jsx("div", { style: { color: "#9ca3af", fontSize: 12, fontWeight: 600, textTransform: "uppercase" }, children: "Client" }), _jsx("div", { style: { fontWeight: 600 }, children: form.clientName }), _jsx("div", { style: { color: "#6b7280" }, children: form.clientEmail }), form.clientPhone && _jsx("div", { style: { color: "#6b7280" }, children: form.clientPhone })] }), _jsxs("div", { children: [_jsx("div", { style: { color: "#9ca3af", fontSize: 12, fontWeight: 600, textTransform: "uppercase" }, children: "Pet" }), _jsx("div", { style: { fontWeight: 600 }, children: form.petName }), _jsxs("div", { style: { color: "#6b7280", textTransform: "capitalize" }, children: [form.petSpecies, form.petBreed ? ` · ${form.petBreed}` : ""] })] }), form.notes && (_jsxs("div", { style: { gridColumn: "1 / -1" }, children: [_jsx("div", { style: { color: "#9ca3af", fontSize: 12, fontWeight: 600, textTransform: "uppercase" }, children: "Notes" }), _jsx("div", { style: { color: "#374151" }, children: form.notes })] }))] }) }), submitError && (_jsx("p", { style: { color: "#ef4444", fontSize: 13, marginBottom: "0.75rem" }, children: submitError })), _jsxs("div", { style: { display: "flex", gap: "0.75rem" }, children: [_jsx("button", { style: secondaryBtn, onClick: () => setStep(3), disabled: submitting, children: "Back" }), _jsx("button", { style: { ...primaryBtn, opacity: submitting ? 0.7 : 1 }, onClick: submitBooking, disabled: submitting, children: submitting ? "Booking…" : "Confirm booking" })] })] })), step === 5 && result && (_jsxs("div", { style: { textAlign: "center", padding: "2rem 1rem" }, children: [_jsx("div", { style: { fontSize: 48, marginBottom: "0.75rem" }, children: "\uD83D\uDC3E" }), _jsx("h2", { style: { fontSize: 20, fontWeight: 700, color: "#1f2937", marginBottom: "0.5rem" }, children: "Booking confirmed!" }), _jsxs("p", { style: { color: "#6b7280", fontSize: 14, marginBottom: "1.5rem" }, children: ["We've booked ", result.pet.name, " in for", " ", selectedService?.name, " on ", fmtDateLong(date), " at", " ", fmtTime(result.appointment.startTime), "."] }), _jsx("div", { style: { ...card, cursor: "default", textAlign: "left", marginBottom: "1.5rem" }, children: _jsxs("p", { style: { margin: 0, fontSize: 14, color: "#374151" }, children: ["A confirmation will be sent to ", _jsx("strong", { children: result.client.email }), ". If you need to reschedule or cancel, please contact us."] }) }), _jsx("button", { style: primaryBtn, onClick: () => {
                            setStep(1);
                            setSelectedService(null);
                            setSelectedSlot(null);
                            setResult(null);
                            setForm({
                                serviceId: "", startTime: "", clientName: "", clientEmail: "",
                                clientPhone: "", petName: "", petSpecies: "", petBreed: "", notes: "",
                            });
                        }, children: "Book another appointment" })] }))] }));
}
