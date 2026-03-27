import { useState } from "react";
import { Calendar, Clock, Plus, ChevronRight, ChevronDown, Search, Repeat, Loader2 } from "lucide-react";
import { UPCOMING_APPOINTMENTS, PAST_APPOINTMENTS, PETS, SERVICES, GROOMERS } from "../mockData.js";
import type { Appointment, Pet, Service, Groomer } from "../mockData.js";

const MAX_CUSTOMER_NOTES = 500;

interface Props {
  readOnly: boolean;
  sessionId?: string | null;
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

export function parseTimeTo24Hour(time: string): string {
  const parts = time.split(" ");
  const hoursMinutes = parts[0] ?? "";
  const period = parts[1] ?? "";
  const [hoursStr, minutesStr] = hoursMinutes.split(":");
  const hours = parseInt(hoursStr ?? "0", 10);
  const minutes = parseInt(minutesStr ?? "0", 10);
  let hours24 = hours;
  if (period === "PM" && hours !== 12) hours24 += 12;
  if (period === "AM" && hours === 12) hours24 = 0;
  return `${hours24.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:00`;
}

export function isUpcoming(appt: Appointment): boolean {
  const now = new Date();
  const apptDate = new Date(`${appt.date}T${parseTimeTo24Hour(appt.time)}`);
  return apptDate > now && appt.status !== "cancelled" && appt.status !== "completed";
}

const STATUS_COLORS: Record<string, string> = {
  confirmed: "bg-green-100 text-green-700",
  pending: "bg-amber-100 text-amber-700",
  waitlisted: "bg-blue-100 text-blue-700",
  completed: "bg-stone-100 text-stone-600",
  cancelled: "bg-red-100 text-red-600",
};

const CONFIRMATION_STATUS_COLORS: Record<string, string> = {
  confirmed: "bg-green-100 text-green-700",
  pending: "bg-amber-100 text-amber-700",
  cancelled: "bg-red-100 text-red-600",
};

export function AppointmentsSection({ readOnly, sessionId }: Props) {
  const [showBooking, setShowBooking] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <button
            onClick={() => setTab("upcoming")}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === "upcoming" ? "bg-(--color-accent-light) text-(--color-accent-dark)" : "text-stone-500 hover:bg-stone-50"}`}
          >
            Upcoming ({UPCOMING_APPOINTMENTS.length})
          </button>
          <button
            onClick={() => setTab("past")}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === "past" ? "bg-(--color-accent-light) text-(--color-accent-dark)" : "text-stone-500 hover:bg-stone-50"}`}
          >
            Past ({PAST_APPOINTMENTS.length})
          </button>
        </div>
        {!readOnly && (
          <button
            onClick={() => setShowBooking(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-(--color-accent) text-white rounded-lg text-sm font-medium hover:bg-(--color-accent-hover)"
          >
            <Plus size={16} />
            Book New
          </button>
        )}
      </div>

      {tab === "upcoming" && (
        <div className="space-y-3">
          {UPCOMING_APPOINTMENTS.map(appt => (
            <AppointmentCard
              key={appt.id}
              appointment={appt}
              expanded={expandedId === appt.id}
              onToggle={() => setExpandedId(expandedId === appt.id ? null : appt.id)}
              readOnly={readOnly}
              sessionId={sessionId}
            />
          ))}
          {UPCOMING_APPOINTMENTS.length === 0 && (
            <p className="text-center text-stone-400 py-8">No upcoming appointments</p>
          )}
        </div>
      )}

      {tab === "past" && (
        <div className="space-y-3">
          {PAST_APPOINTMENTS.map(appt => (
            <AppointmentCard
              key={appt.id}
              appointment={appt}
              expanded={expandedId === appt.id}
              onToggle={() => setExpandedId(expandedId === appt.id ? null : appt.id)}
              readOnly={readOnly}
              sessionId={sessionId}
            />
          ))}
        </div>
      )}

      {showBooking && (
        <BookingFlow
          onClose={() => setShowBooking(false)}
          readOnly={readOnly}
        />
      )}
    </div>
  );
}

function AppointmentCard({
  appointment: appt, expanded, onToggle, readOnly, sessionId,
}: {
  appointment: Appointment; expanded: boolean; onToggle: () => void; readOnly: boolean; sessionId?: string | null;
}) {
  return (
    <div className="bg-white rounded-xl border border-stone-200 shadow-sm overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center gap-4 p-4 text-left hover:bg-stone-50">
        <div className="w-10 h-10 rounded-lg bg-(--color-accent-light) flex items-center justify-center text-lg shrink-0">
          {PETS.find(p => p.id === appt.petId)?.photo || "🐾"}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-stone-800 text-sm">{appt.petName} — {appt.services.join(", ")}</p>
          <div className="flex items-center gap-3 text-xs text-stone-500 mt-0.5">
            <span className="flex items-center gap-1"><Calendar size={12} />{formatDate(appt.date)}</span>
            <span className="flex items-center gap-1"><Clock size={12} />{appt.time}</span>
            <span>with {appt.groomerName}</span>
          </div>
        </div>
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[appt.status] || ""}`}>
          {appt.status}
        </span>
        {expanded ? <ChevronDown size={16} className="text-stone-400" /> : <ChevronRight size={16} className="text-stone-400" />}
      </button>
      {expanded && (
        <div className="px-4 pb-4 pt-0 border-t border-stone-100">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-3 text-sm">
            <div>
              <p className="text-xs text-stone-400">Duration</p>
              <p className="text-stone-700">{appt.duration} min</p>
            </div>
            <div>
              <p className="text-xs text-stone-400">Estimated Price</p>
              <p className="text-stone-700">${appt.price}</p>
            </div>
            {appt.addOns.length > 0 && (
              <div className="col-span-2">
                <p className="text-xs text-stone-400">Add-ons</p>
                <p className="text-stone-700">{appt.addOns.join(", ")}</p>
              </div>
            )}
          </div>
          {appt.notes && (
            <p className="text-sm text-stone-600 bg-stone-50 rounded-lg px-3 py-2 mb-3">{appt.notes}</p>
          )}
          {isUpcoming(appt) && !readOnly && (
            <CustomerNotesSection appointment={appt} sessionId={sessionId} />
          )}
          {isUpcoming(appt) && (
            <ConfirmationSection appointment={appt} sessionId={sessionId} />
          )}
          {appt.status !== "completed" && appt.status !== "cancelled" && !readOnly && (
            <div className="flex gap-2 mt-3">
              <button className="text-xs px-3 py-1.5 border border-stone-200 rounded-lg text-stone-600 hover:bg-stone-50">
                Reschedule
              </button>
              <CancelAppointmentButton appointment={appt} sessionId={sessionId} />
            </div>
          )}
          {appt.reportCardId && (
            <div className="mt-2">
              <span className="text-xs text-(--color-accent-dark) font-medium cursor-pointer hover:underline">
                View Report Card →
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ConfirmationSection({ appointment: appt, sessionId }: { appointment: Appointment; sessionId?: string | null }) {
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [confirmSuccess, setConfirmSuccess] = useState(false);
  // Local state mirrors confirmationStatus so the badge updates immediately after confirm
  const [localStatus, setLocalStatus] = useState(appt.confirmationStatus);

  async function handleConfirm() {
    if (!window.confirm("Confirm this appointment?")) return;
    setConfirming(true);
    setConfirmError(null);
    try {
      const headers: Record<string, string> = {};
      if (sessionId) {
        headers["X-Impersonation-Session-Id"] = sessionId;
      }
      const res = await fetch(`/api/portal/appointments/${appt.id}/confirm`, {
        method: "POST",
        headers,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to confirm" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      setLocalStatus("confirmed");
      setConfirmSuccess(true);
      setTimeout(() => setConfirmSuccess(false), 2000);
    } catch (e) {
      setConfirmError(e instanceof Error ? e.message : "Failed to confirm");
    } finally {
      setConfirming(false);
    }
  }

  const currentStatus = localStatus ?? appt.confirmationStatus;
  const statusLabel = currentStatus === "confirmed"
    ? "✓ Confirmed"
    : currentStatus === "pending"
    ? "Pending confirmation"
    : "Cancelled";

  return (
    <div className="mt-3 p-3 bg-stone-50 rounded-lg">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${CONFIRMATION_STATUS_COLORS[currentStatus] || ""}`}>
            {statusLabel}
          </span>
        </div>
        {!confirmSuccess && currentStatus === "pending" && (
          <button
            onClick={handleConfirm}
            disabled={confirming}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {confirming && <Loader2 size={12} className="animate-spin" />}
            {confirming ? "Confirming..." : "Confirm Appointment"}
          </button>
        )}
        {confirmSuccess && (
          <span className="text-xs text-green-600 font-medium">Confirmed!</span>
        )}
      </div>
      {confirmError && <p className="text-xs text-red-500 mt-1">{confirmError}</p>}
    </div>
  );
}

function CancelAppointmentButton({ appointment: appt, sessionId }: { appointment: Appointment; sessionId?: string | null }) {
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  async function handleCancel() {
    if (!window.confirm("Cancel this appointment? This cannot be undone.")) return;
    setCancelling(true);
    setCancelError(null);
    try {
      const headers: Record<string, string> = {};
      if (sessionId) {
        headers["X-Impersonation-Session-Id"] = sessionId;
      }
      const res = await fetch(`/api/portal/appointments/${appt.id}/cancel`, {
        method: "POST",
        headers,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to cancel" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      window.location.reload();
    } catch (e) {
      setCancelError(e instanceof Error ? e.message : "Failed to cancel");
      setCancelling(false);
    }
  }

  return (
    <>
      <button
        onClick={handleCancel}
        disabled={cancelling}
        className="text-xs px-3 py-1.5 border border-red-200 rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {cancelling ? "Cancelling..." : "Cancel"}
      </button>
      {cancelError && <p className="text-xs text-red-500 mt-1">{cancelError}</p>}
    </>
  );
}

export function CustomerNotesSection({ appointment: appt, sessionId }: { appointment: Appointment; sessionId?: string | null }) {
  const [notes, setNotes] = useState(appt.customerNotes || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDisabled = appt.status === "completed" || appt.status === "cancelled";

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (sessionId) {
        headers["X-Impersonation-Session-Id"] = sessionId;
      }
      const res = await fetch(`/api/portal/appointments/${appt.id}/notes`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ customerNotes: notes }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to save" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 p-3 bg-stone-50 rounded-lg">
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs font-medium text-stone-600">Notes for your groomer</label>
        <span className={`text-xs ${notes.length > MAX_CUSTOMER_NOTES ? "text-red-500" : "text-stone-400"}`}>
          {notes.length}/{MAX_CUSTOMER_NOTES}
        </span>
      </div>
      <textarea
        value={notes}
        onChange={e => setNotes(e.target.value.slice(0, MAX_CUSTOMER_NOTES))}
        disabled={isDisabled}
        className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-(--color-accent) disabled:bg-stone-100 disabled:text-stone-400"
        rows={3}
        placeholder="Any special requests or notes for this appointment..."
      />
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      {saved && <p className="text-xs text-green-600 mt-1">Saved!</p>}
      {!isDisabled && (
        <button
          onClick={handleSave}
          disabled={saving || notes === appt.customerNotes}
          className="mt-2 flex items-center gap-1.5 text-xs px-3 py-1.5 bg-(--color-accent) text-white rounded-lg font-medium hover:bg-(--color-accent-hover) disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving && <Loader2 size={12} className="animate-spin" />}
          {saving ? "Saving..." : "Save Notes"}
        </button>
      )}
    </div>
  );
}

function BookingFlow({ onClose, readOnly }: { onClose: () => void; readOnly: boolean }) {
  const [step, setStep] = useState(1);
  const [selectedPet, setSelectedPet] = useState<Pet | null>(null);
  const [selectedServices, setSelectedServices] = useState<Service[]>([]);
  const [selectedAddOns, setSelectedAddOns] = useState<Service[]>([]);
  const [selectedGroomer, setSelectedGroomer] = useState<Groomer | null>(null);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [notes, setNotes] = useState("");
  const [recurring, setRecurring] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  const availableTimes = ["9:00 AM", "10:00 AM", "11:00 AM", "1:00 PM", "2:00 PM", "3:00 PM", "4:00 PM"];
  const mainServices = SERVICES.filter(s => !s.isAddOn);
  const addOnServices = SERVICES.filter(s => s.isAddOn);

  if (readOnly) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-stone-200">
          <h2 className="font-semibold text-stone-800">Book Appointment</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600">✕</button>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center gap-1 px-5 pt-4">
          {[1, 2, 3, 4, 5].map(s => (
            <div key={s} className={`flex-1 h-1.5 rounded-full ${s <= step ? "bg-(--color-accent)" : "bg-stone-200"}`} />
          ))}
        </div>

        <div className="p-5">
          {confirmed ? (
            <div className="text-center py-8">
              <div className="text-4xl mb-3">🎉</div>
              <h3 className="text-lg font-semibold text-stone-800 mb-1">Appointment Booked!</h3>
              <p className="text-sm text-stone-500 mb-4">
                {selectedPet?.name} with {selectedGroomer?.name || "First Available"} on {formatDate(selectedDate)} at {selectedTime}
              </p>
              <button onClick={onClose} className="px-4 py-2 bg-(--color-accent) text-white rounded-lg text-sm font-medium">
                Done
              </button>
            </div>
          ) : (
            <>
              {/* Step 1: Select Pet */}
              {step === 1 && (
                <div>
                  <h3 className="font-medium text-stone-800 mb-3">Select Pet</h3>
                  <div className="space-y-2">
                    {PETS.map(pet => (
                      <button
                        key={pet.id}
                        onClick={() => { setSelectedPet(pet); setStep(2); }}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-colors ${
                          selectedPet?.id === pet.id ? "border-(--color-accent) bg-(--color-accent-lighter)" : "border-stone-200 hover:border-stone-300"
                        }`}
                      >
                        <span className="text-2xl">{pet.photo}</span>
                        <div>
                          <p className="font-medium text-stone-800">{pet.name}</p>
                          <p className="text-xs text-stone-500">{pet.breed} · {pet.weight} lbs</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Step 2: Select Services */}
              {step === 2 && (
                <div>
                  <h3 className="font-medium text-stone-800 mb-3">Select Services</h3>
                  <div className="space-y-2 mb-4">
                    {mainServices.map(svc => (
                      <button
                        key={svc.id}
                        onClick={() => {
                          setSelectedServices(prev =>
                            prev.find(s => s.id === svc.id) ? prev.filter(s => s.id !== svc.id) : [...prev, svc]
                          );
                        }}
                        className={`w-full flex items-center justify-between p-3 rounded-xl border text-left ${
                          selectedServices.find(s => s.id === svc.id) ? "border-(--color-accent) bg-(--color-accent-lighter)" : "border-stone-200 hover:border-stone-300"
                        }`}
                      >
                        <div>
                          <p className="font-medium text-stone-800 text-sm">{svc.name}</p>
                          <p className="text-xs text-stone-500">{svc.description}</p>
                        </div>
                        <div className="text-right shrink-0 ml-3">
                          <p className="text-sm font-medium text-stone-700">{svc.priceRange}</p>
                          <p className="text-xs text-stone-400">{svc.duration} min</p>
                        </div>
                      </button>
                    ))}
                  </div>
                  {selectedServices.length > 0 && (
                    <>
                      <h4 className="font-medium text-stone-700 text-sm mb-2">Add-ons (optional)</h4>
                      <div className="space-y-2 mb-4">
                        {addOnServices.map(svc => (
                          <button
                            key={svc.id}
                            onClick={() => {
                              setSelectedAddOns(prev =>
                                prev.find(s => s.id === svc.id) ? prev.filter(s => s.id !== svc.id) : [...prev, svc]
                              );
                            }}
                            className={`w-full flex items-center justify-between p-2.5 rounded-lg border text-left text-sm ${
                              selectedAddOns.find(s => s.id === svc.id) ? "border-(--color-accent) bg-(--color-accent-lighter)" : "border-stone-200 hover:border-stone-300"
                            }`}
                          >
                            <div>
                              <p className="font-medium text-stone-800">{svc.name}</p>
                              <p className="text-xs text-stone-500">{svc.description}</p>
                            </div>
                            <span className="text-stone-600 shrink-0 ml-3">{svc.priceRange}</span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                  <div className="flex gap-2 mt-4">
                    <button onClick={() => setStep(1)} className="flex-1 px-4 py-2 border border-stone-200 rounded-lg text-sm">Back</button>
                    <button
                      onClick={() => setStep(3)}
                      disabled={selectedServices.length === 0}
                      className="flex-1 px-4 py-2 bg-(--color-accent) text-white rounded-lg text-sm font-medium disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}

              {/* Step 3: Select Groomer */}
              {step === 3 && (
                <div>
                  <h3 className="font-medium text-stone-800 mb-3">Select Groomer</h3>
                  <div className="space-y-2">
                    <button
                      onClick={() => { setSelectedGroomer(null); setStep(4); }}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left ${
                        selectedGroomer === null ? "border-(--color-accent) bg-(--color-accent-lighter)" : "border-stone-200 hover:border-stone-300"
                      }`}
                    >
                      <div className="w-10 h-10 rounded-full bg-stone-100 flex items-center justify-center">
                        <Search size={16} className="text-stone-400" />
                      </div>
                      <div>
                        <p className="font-medium text-stone-800">First Available</p>
                        <p className="text-xs text-stone-500">We'll match you with the best available groomer</p>
                      </div>
                    </button>
                    {GROOMERS.map(g => (
                      <button
                        key={g.id}
                        onClick={() => { setSelectedGroomer(g); setStep(4); }}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left ${
                          selectedGroomer?.id === g.id ? "border-(--color-accent) bg-(--color-accent-lighter)" : "border-stone-200 hover:border-stone-300"
                        }`}
                      >
                        <div className="w-10 h-10 rounded-full bg-(--color-accent-light) flex items-center justify-center text-xl">
                          {g.avatar}
                        </div>
                        <div>
                          <p className="font-medium text-stone-800">{g.name}</p>
                          <p className="text-xs text-stone-500">{g.specialties.join(" · ")}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                  <button onClick={() => setStep(2)} className="w-full mt-4 px-4 py-2 border border-stone-200 rounded-lg text-sm">Back</button>
                </div>
              )}

              {/* Step 4: Date & Time */}
              {step === 4 && (
                <div>
                  <h3 className="font-medium text-stone-800 mb-3">Pick Date & Time</h3>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={e => setSelectedDate(e.target.value)}
                    min={new Date().toISOString().split("T")[0]}
                    className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm mb-3"
                  />
                  {selectedDate && (
                    <div className="grid grid-cols-3 gap-2 mb-4">
                      {availableTimes.map(time => (
                        <button
                          key={time}
                          onClick={() => setSelectedTime(time)}
                          className={`px-3 py-2 rounded-lg text-sm border ${
                            selectedTime === time ? "border-(--color-accent) bg-(--color-accent-lighter) font-medium" : "border-stone-200 hover:border-stone-300"
                          }`}
                        >
                          {time}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="mb-4">
                    <label className="flex items-center gap-2 text-sm text-stone-700 mb-1">
                      <Repeat size={14} />
                      Recurring (optional)
                    </label>
                    <select
                      value={recurring}
                      onChange={e => setRecurring(e.target.value)}
                      className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="">One-time</option>
                      <option value="4">Every 4 weeks</option>
                      <option value="6">Every 6 weeks</option>
                      <option value="8">Every 8 weeks</option>
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setStep(3)} className="flex-1 px-4 py-2 border border-stone-200 rounded-lg text-sm">Back</button>
                    <button
                      onClick={() => setStep(5)}
                      disabled={!selectedDate || !selectedTime}
                      className="flex-1 px-4 py-2 bg-(--color-accent) text-white rounded-lg text-sm font-medium disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}

              {/* Step 5: Review & Confirm */}
              {step === 5 && (
                <div>
                  <h3 className="font-medium text-stone-800 mb-3">Review & Confirm</h3>
                  <div className="bg-stone-50 rounded-xl p-4 space-y-2 text-sm mb-4">
                    <div className="flex justify-between"><span className="text-stone-500">Pet</span><span className="font-medium">{selectedPet?.name}</span></div>
                    <div className="flex justify-between"><span className="text-stone-500">Services</span><span className="font-medium">{selectedServices.map(s => s.name).join(", ")}</span></div>
                    {selectedAddOns.length > 0 && (
                      <div className="flex justify-between"><span className="text-stone-500">Add-ons</span><span className="font-medium">{selectedAddOns.map(s => s.name).join(", ")}</span></div>
                    )}
                    <div className="flex justify-between"><span className="text-stone-500">Groomer</span><span className="font-medium">{selectedGroomer?.name || "First Available"}</span></div>
                    <div className="flex justify-between"><span className="text-stone-500">Date & Time</span><span className="font-medium">{formatDate(selectedDate)} at {selectedTime}</span></div>
                    {recurring && <div className="flex justify-between"><span className="text-stone-500">Recurring</span><span className="font-medium">Every {recurring} weeks</span></div>}
                  </div>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-stone-700 mb-1">Notes for groomer (optional)</label>
                    <textarea
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                      className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm"
                      rows={2}
                      placeholder="Any special instructions..."
                    />
                  </div>
                  <div className="bg-amber-50 rounded-lg px-3 py-2 text-xs text-amber-700 mb-4">
                    Free cancellation up to 24 hours before. Late cancellation fee: $25.
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setStep(4)} className="flex-1 px-4 py-2 border border-stone-200 rounded-lg text-sm">Back</button>
                    <button
                      onClick={() => setConfirmed(true)}
                      className="flex-1 px-4 py-2 bg-(--color-accent) text-white rounded-lg text-sm font-medium hover:bg-(--color-accent-hover)"
                    >
                      Confirm Booking
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
