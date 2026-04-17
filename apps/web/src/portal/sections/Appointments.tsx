import React, { useState, useEffect } from 'react';
import { Calendar, Clock, Plus, ChevronRight, ChevronDown, Loader2 } from 'lucide-react';

export interface Appointment {
  id: string;
  petId: string;
  serviceId: string;
  groomerId: string | null;
  date: string;
  time: string;
  status: 'scheduled' | 'confirmed' | 'pending' | 'waitlisted' | 'completed' | 'cancelled' | 'no-show';
  petName?: string;
  serviceName?: string;
  groomerName?: string;
  duration?: number;
  price?: number;
  notes?: string;
  customerNotes?: string;
  addOns?: string[];
  confirmationStatus?: 'confirmed' | 'pending' | 'cancelled';
}

interface Pet {
  id: string;
  name: string;
  breed: string;
  weight?: number;
  photo?: string;
  imageUrl?: string;
}

interface Service {
  id: string;
  name: string;
  description?: string;
  duration: number;
  price: number;
  priceRange?: string;
  isAddOn?: boolean;
}

interface AppointmentsSectionProps {
  sessionId: string | null;
  readOnly: boolean;
}

interface RescheduleFlowProps {
  appointment: Appointment;
  onClose: () => void;
  sessionId: string | null;
}

const MAX_CUSTOMER_NOTES = 500;

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function parseTimeTo24Hour(time: string): string {
  const parts = time.split(' ');
  const hoursMinutes = parts[0] ?? '';
  const period = parts[1] ?? '';
  const [hoursStr, minutesStr] = hoursMinutes.split(':');
  const hours = parseInt(hoursStr ?? '0', 10);
  const minutes = parseInt(minutesStr ?? '0', 10);
  let hours24 = hours;
  if (period === 'PM' && hours !== 12) hours24 += 12;
  if (period === 'AM' && hours === 12) hours24 = 0;
  return `${hours24.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`;
}

export function isUpcoming(appt: Appointment): boolean {
  const now = new Date();
  const apptDate = new Date(`${appt.date}T${parseTimeTo24Hour(appt.time)}`);
  return apptDate > now && appt.status !== 'cancelled' && appt.status !== 'completed';
}

const STATUS_COLORS: Record<string, string> = {
  confirmed: 'bg-green-100 text-green-700',
  pending: 'bg-amber-100 text-amber-700',
  waitlisted: 'bg-blue-100 text-blue-700',
  completed: 'bg-stone-100 text-stone-600',
  cancelled: 'bg-red-100 text-red-600',
  'no-show': 'bg-yellow-100 text-yellow-700',
  scheduled: 'bg-blue-100 text-blue-700',
};

const CONFIRMATION_STATUS_COLORS: Record<string, string> = {
  confirmed: 'bg-green-100 text-green-700',
  pending: 'bg-amber-100 text-amber-700',
  cancelled: 'bg-red-100 text-red-600',
};

export const AppointmentsSection: React.FC<AppointmentsSectionProps> = ({ sessionId, readOnly }) => {
  const [upcomingAppointments, setUpcomingAppointments] = useState<Appointment[]>([]);
  const [pastAppointments, setPastAppointments] = useState<Appointment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showBooking, setShowBooking] = useState(false);
  const [showReschedule, setShowReschedule] = useState(false);
  const [rescheduleAppointment, setRescheduleAppointment] = useState<Appointment | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');

  useEffect(() => {
    const fetchAppointments = async () => {
      if (!sessionId) {
        setUpcomingAppointments([]);
        setPastAppointments([]);
        setIsLoading(false);
        return;
      }

      try {
        const response = await fetch('/api/portal/appointments', {
          headers: { "X-Impersonation-Session-Id": sessionId ?? "" },
        });

        if (response.ok) {
          const data = await response.json();
          const fetchedAppointments: Appointment[] = data.appointments || data || [];

          const upcoming = fetchedAppointments.filter((appt) => isUpcoming(appt));
          const past = fetchedAppointments.filter((appt) => !isUpcoming(appt));

          setUpcomingAppointments(upcoming);
          setPastAppointments(past);
        } else {
          setError('Failed to load appointments.');
        }
      } catch {
        setError('Failed to load appointments. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchAppointments();
  }, [sessionId]);

  const handleReschedule = (appointment: Appointment) => {
    setRescheduleAppointment(appointment);
    setShowReschedule(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-blue-600" size={24} />
        <span className="ml-3 text-gray-600">Loading appointments...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 mb-4">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <button
            onClick={() => setTab('upcoming')}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              tab === 'upcoming'
                ? 'bg-blue-100 text-blue-700'
                : 'text-stone-500 hover:bg-stone-50'
            }`}
          >
            Upcoming ({upcomingAppointments.length})
          </button>
          <button
            onClick={() => setTab('past')}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              tab === 'past' ? 'bg-blue-100 text-blue-700' : 'text-stone-500 hover:bg-stone-50'
            }`}
          >
            Past ({pastAppointments.length})
          </button>
        </div>
        {!readOnly && (
          <button
            onClick={() => setShowBooking(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            <Plus size={16} />
            Book New
          </button>
        )}
      </div>

      {tab === 'upcoming' && (
        <div className="space-y-3">
          {upcomingAppointments.map((appt) => (
            <AppointmentCard
              key={appt.id}
              appointment={appt}
              expanded={expandedId === appt.id}
              onToggle={() => setExpandedId(expandedId === appt.id ? null : appt.id)}
              readOnly={readOnly}
              sessionId={sessionId}
              onReschedule={handleReschedule}
            />
          ))}
          {upcomingAppointments.length === 0 && (
            <p className="text-center text-stone-400 py-8">No upcoming appointments</p>
          )}
        </div>
      )}

      {tab === 'past' && (
        <div className="space-y-3">
          {pastAppointments.map((appt) => (
            <AppointmentCard
              key={appt.id}
              appointment={appt}
              expanded={expandedId === appt.id}
              onToggle={() => setExpandedId(expandedId === appt.id ? null : appt.id)}
              readOnly={readOnly}
              sessionId={sessionId}
              onReschedule={handleReschedule}
            />
          ))}
        </div>
      )}

      {showBooking && (
        <BookingFlow onClose={() => setShowBooking(false)} sessionId={sessionId} />
      )}
      {showReschedule && rescheduleAppointment && (
        <RescheduleFlow
          appointment={rescheduleAppointment}
          onClose={() => {
            setShowReschedule(false);
            setRescheduleAppointment(null);
          }}
          sessionId={sessionId}
        />
      )}
    </div>
  );
};

function AppointmentCard({
  appointment: appt,
  expanded,
  onToggle,
  readOnly,
  sessionId,
  onReschedule,
}: {
  appointment: Appointment;
  expanded: boolean;
  onToggle: () => void;
  readOnly: boolean;
  sessionId: string | null;
  onReschedule: (appt: Appointment) => void;
}) {
  return (
    <div className="bg-white rounded-xl border border-stone-200 shadow-sm overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-4 p-4 text-left hover:bg-stone-50"
      >
        <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center text-lg shrink-0">
          {appt.petName?.charAt(0) || 'P'}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-stone-800 text-sm">
            {appt.petName || 'Pet'} — {appt.serviceName || 'Service'}
          </p>
          <div className="flex items-center gap-3 text-xs text-stone-500 mt-0.5">
            <span className="flex items-center gap-1">
              <Calendar size={12} />
              {formatDate(appt.date)}
            </span>
            <span className="flex items-center gap-1">
              <Clock size={12} />
              {appt.time}
            </span>
            <span>with {appt.groomerName || 'First Available'}</span>
          </div>
        </div>
        <span
          className={`px-2 py-0.5 rounded-full text-xs font-medium ${
            STATUS_COLORS[appt.status] || ''
          }`}
        >
          {appt.status}
        </span>
        {expanded ? (
          <ChevronDown size={16} className="text-stone-400" />
        ) : (
          <ChevronRight size={16} className="text-stone-400" />
        )}
      </button>
      {expanded && (
        <div className="px-4 pb-4 pt-0 border-t border-stone-100">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-3 text-sm">
            {appt.duration && (
              <div>
                <p className="text-xs text-stone-400">Duration</p>
                <p className="text-stone-700">{appt.duration} min</p>
              </div>
            )}
            {appt.price && (
              <div>
                <p className="text-xs text-stone-400">Estimated Price</p>
                <p className="text-stone-700">${appt.price}</p>
              </div>
            )}
            {appt.addOns && appt.addOns.length > 0 && (
              <div className="col-span-2">
                <p className="text-xs text-stone-400">Add-ons</p>
                <p className="text-stone-700">{appt.addOns.join(', ')}</p>
              </div>
            )}
          </div>
          {appt.notes && (
            <p className="text-sm text-stone-600 bg-stone-50 rounded-lg px-3 py-2 mb-3">
              {appt.notes}
            </p>
          )}
          {isUpcoming(appt) && !readOnly && (
            <CustomerNotesSection appointment={appt} sessionId={sessionId} />
          )}
          {isUpcoming(appt) && <ConfirmationSection appointment={appt} sessionId={sessionId} />}
          {appt.status !== 'completed' &&
            appt.status !== 'cancelled' &&
            !readOnly && (
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => onReschedule(appt)}
                  className="text-xs px-3 py-1.5 border border-stone-200 rounded-lg text-stone-600 hover:bg-stone-50"
                >
                  Reschedule
                </button>
                <CancelAppointmentButton appointment={appt} sessionId={sessionId} />
              </div>
            )}
        </div>
      )}
    </div>
  );
}

export function ConfirmationSection({
  appointment: appt,
  sessionId,
}: {
  appointment: Appointment;
  sessionId: string | null;
}) {
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [confirmSuccess, setConfirmSuccess] = useState(false);
  const [localStatus, setLocalStatus] = useState(appt.confirmationStatus);

  async function handleConfirm() {
    if (!window.confirm('Confirm this appointment?')) return;
    setConfirming(true);
    setConfirmError(null);
    try {
      const headers: Record<string, string> = {};
      if (sessionId) {
        headers['Authorization'] = `Bearer ${sessionId}`;
      }
      const res = await fetch(`/api/portal/appointments/${appt.id}/confirm`, {
        method: 'POST',
        headers,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to confirm' }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      setLocalStatus('confirmed');
      setConfirmSuccess(true);
      setTimeout(() => setConfirmSuccess(false), 2000);
    } catch (e) {
      setConfirmError(e instanceof Error ? e.message : 'Failed to confirm');
    } finally {
      setConfirming(false);
    }
  }

  const currentStatus = localStatus ?? appt.confirmationStatus;
  const statusLabel =
    currentStatus === 'confirmed'
      ? 'Confirmed'
      : currentStatus === 'pending'
        ? 'Pending confirmation'
        : 'Cancelled';

  return (
    <div className="mt-3 p-3 bg-stone-50 rounded-lg">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`px-2 py-0.5 rounded-full text-xs font-medium ${
              CONFIRMATION_STATUS_COLORS[currentStatus || 'pending'] || ''
            }`}
          >
            {statusLabel}
          </span>
        </div>
        {!confirmSuccess && currentStatus === 'pending' && (
          <button
            onClick={handleConfirm}
            disabled={confirming}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {confirming && <Loader2 size={12} className="animate-spin" />}
            {confirming ? 'Confirming...' : 'Confirm Appointment'}
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

function CancelAppointmentButton({
  appointment: appt,
  sessionId,
}: {
  appointment: Appointment;
  sessionId: string | null;
}) {
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  async function handleCancel() {
    if (!window.confirm('Cancel this appointment? This cannot be undone.')) return;
    setCancelling(true);
    setCancelError(null);
    try {
      const headers: Record<string, string> = {};
      if (sessionId) {
        headers['Authorization'] = `Bearer ${sessionId}`;
      }
      const res = await fetch(`/api/portal/appointments/${appt.id}/cancel`, {
        method: 'POST',
        headers,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to cancel' }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      window.location.reload();
    } catch (e) {
      setCancelError(e instanceof Error ? e.message : 'Failed to cancel');
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
        {cancelling ? 'Cancelling...' : 'Cancel'}
      </button>
      {cancelError && <p className="text-xs text-red-500 mt-1">{cancelError}</p>}
    </>
  );
}

export function CustomerNotesSection({
  appointment: appt,
  sessionId,
}: {
  appointment: Appointment;
  sessionId: string | null;
}) {
  const [notes, setNotes] = useState(appt.customerNotes || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDisabled = appt.status === 'completed' || appt.status === 'cancelled';

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (sessionId) {
        headers['Authorization'] = `Bearer ${sessionId}`;
      }
      const res = await fetch(`/api/portal/appointments/${appt.id}/notes`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ customerNotes: notes }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to save' }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 p-3 bg-stone-50 rounded-lg">
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs font-medium text-stone-600">Notes for your groomer</label>
        <span
          className={`text-xs ${
            notes.length > MAX_CUSTOMER_NOTES ? 'text-red-500' : 'text-stone-400'
          }`}
        >
          {notes.length}/{MAX_CUSTOMER_NOTES}
        </span>
      </div>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value.slice(0, MAX_CUSTOMER_NOTES))}
        disabled={isDisabled}
        className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-stone-100 disabled:text-stone-400"
        rows={3}
        placeholder="Any special requests or notes for this appointment..."
      />
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      {saved && <p className="text-xs text-green-600 mt-1">Saved!</p>}
      {!isDisabled && (
        <button
          onClick={handleSave}
          disabled={saving || notes === appt.customerNotes}
          className="mt-2 flex items-center gap-1.5 text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving && <Loader2 size={12} className="animate-spin" />}
          {saving ? 'Saving...' : 'Save Notes'}
        </button>
      )}
    </div>
  );
}

export function RescheduleFlow({
  appointment: appt,
  onClose,
  sessionId,
}: RescheduleFlowProps) {
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const availableTimes = [
    '9:00 AM',
    '10:00 AM',
    '11:00 AM',
    '1:00 PM',
    '2:00 PM',
    '3:00 PM',
    '4:00 PM',
  ];

  async function handleSubmit() {
    if (!selectedDate || !selectedTime) return;

    const [hoursMinutes = '', period = ''] = selectedTime.split(' ');
    const [hoursStr = '0', minutesStr = '0'] = hoursMinutes.split(':');
    let hours = parseInt(hoursStr, 10);
    const minutes = parseInt(minutesStr ?? '0', 10);
    if (period === 'PM' && hours !== 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;
    const isoTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`;
    const startTime = new Date(`${selectedDate}T${isoTime}`).toISOString();

    setSubmitting(true);
    setError(null);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (sessionId) headers['Authorization'] = `Bearer ${sessionId}`;
      const res = await fetch(`/api/portal/appointments/${appt.id}/reschedule`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ startTime }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to reschedule' }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      setSuccess(true);
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reschedule');
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-stone-200">
          <h2 className="font-semibold text-stone-800">Reschedule Appointment</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600">
            Close
          </button>
        </div>

        <div className="p-5">
          {success ? (
            <div className="text-center py-8">
              <div className="text-4xl mb-3">OK</div>
              <h3 className="text-lg font-semibold text-stone-800 mb-1">
                Appointment Rescheduled!
              </h3>
              <p className="text-sm text-stone-500">Redirecting...</p>
            </div>
          ) : (
            <>
              <div className="bg-stone-50 rounded-xl p-4 mb-4 text-sm">
                <p className="font-medium text-stone-800">
                  {appt.petName || 'Pet'} — {appt.serviceName || 'Service'}
                </p>
                <p className="text-stone-500 mt-0.5">
                  {formatDate(appt.date)} at {appt.time} with{' '}
                  {appt.groomerName || 'First Available'}
                </p>
              </div>

              <h3 className="font-medium text-stone-800 mb-3">Pick a New Date & Time</h3>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm mb-3"
              />
              {selectedDate && (
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {availableTimes.map((time) => (
                    <button
                      key={time}
                      onClick={() => setSelectedTime(time)}
                      className={`px-3 py-2 rounded-lg text-sm border ${
                        selectedTime === time
                          ? 'border-blue-500 bg-blue-50 font-medium'
                          : 'border-stone-200 hover:border-stone-300'
                      }`}
                    >
                      {time}
                    </button>
                  ))}
                </div>
              )}

              {error && <p className="text-xs text-red-500 mb-3">{error}</p>}

              <div className="flex gap-2">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-2 border border-stone-200 rounded-lg text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!selectedDate || !selectedTime || submitting}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? 'Rescheduling...' : 'Confirm Reschedule'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

interface BookingFlowProps {
  onClose: () => void;
  sessionId: string | null;
}

function BookingFlow({ onClose, sessionId }: BookingFlowProps) {
  const [step, setStep] = useState(1);
  const [pets, setPets] = useState<Pet[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [selectedPet, setSelectedPet] = useState<Pet | null>(null);
  const [selectedServices, setSelectedServices] = useState<Service[]>([]);
  const [selectedAddOns, setSelectedAddOns] = useState<Service[]>([]);
  const [selectedGroomer] = useState<string>('first-available');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [notes, setNotes] = useState('');
  const [recurring, setRecurring] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const availableTimes = [
    '9:00 AM',
    '10:00 AM',
    '11:00 AM',
    '1:00 PM',
    '2:00 PM',
    '3:00 PM',
    '4:00 PM',
  ];

  useEffect(() => {
    const fetchData = async () => {
      if (!sessionId) {
        setLoading(false);
        return;
      }

      try {
        const [petsRes, servicesRes] = await Promise.all([
          fetch('/api/portal/pets', {
            headers: { "X-Impersonation-Session-Id": sessionId ?? "" },
          }),
          fetch('/api/portal/services', {
            headers: { "X-Impersonation-Session-Id": sessionId ?? "" },
          }),
        ]);

        if (petsRes.ok) {
          const petsData = await petsRes.json();
          setPets(petsData.pets || petsData || []);
        }

        if (servicesRes.ok) {
          const servicesData = await servicesRes.json();
          setServices(servicesData.services || servicesData || []);
        }
      } catch {
        setError('Failed to load data. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [sessionId]);

  const mainServices = services.filter((s) => !s.isAddOn);
  const addOnServices = services.filter((s) => s.isAddOn);

  async function handleConfirmBooking() {
    if (!sessionId || !selectedPet || selectedServices.length === 0) return;

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/portal/waitlist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionId}`,
        },
        body: JSON.stringify({
          petId: selectedPet.id,
          serviceId: selectedServices[0]?.id,
          serviceIds: selectedServices.map((s) => s.id),
          addOnIds: selectedAddOns.map((s) => s.id),
          groomerId: selectedGroomer === 'first-available' ? null : selectedGroomer,
          preferredDate: selectedDate,
          preferredTime: selectedTime,
          notes: notes || undefined,
          recurring: recurring || undefined,
        }),
      });

      if (response.ok) {
        setConfirmed(true);
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } else {
        const data = await response.json();
        setError(data.message || 'Failed to book appointment. Please try again.');
        setSubmitting(false);
      }
    } catch {
      setError('Failed to book appointment. Please try again.');
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-8">
          <div className="flex items-center justify-center">
            <Loader2 className="animate-spin text-blue-600" size={24} />
            <span className="ml-3 text-gray-600">Loading...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-stone-200">
          <h2 className="font-semibold text-stone-800">Book Appointment</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600">
            Close
          </button>
        </div>

        <div className="flex items-center gap-1 px-5 pt-4">
          {[1, 2, 3, 4, 5].map((s) => (
            <div
              key={s}
              className={`flex-1 h-1.5 rounded-full ${s <= step ? 'bg-blue-600' : 'bg-stone-200'}`}
            />
          ))}
        </div>

        <div className="p-5">
          {confirmed ? (
            <div className="text-center py-8">
              <div className="text-4xl mb-3">OK</div>
              <h3 className="text-lg font-semibold text-stone-800 mb-1">
                Appointment Requested!
              </h3>
              <p className="text-sm text-stone-500 mb-4">
                {selectedPet?.name} on {formatDate(selectedDate)} at {selectedTime}
              </p>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium"
              >
                Done
              </button>
            </div>
          ) : (
            <>
              {step === 1 && (
                <div>
                  <h3 className="font-medium text-stone-800 mb-3">Select Pet</h3>
                  <div className="space-y-2">
                    {pets.map((pet) => (
                      <button
                        key={pet.id}
                        onClick={() => {
                          setSelectedPet(pet);
                          setStep(2);
                        }}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-colors ${
                          selectedPet?.id === pet.id
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-stone-200 hover:border-stone-300'
                        }`}
                      >
                        <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center text-lg">
                          {pet.photo || pet.name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-medium text-stone-800">{pet.name}</p>
                          <p className="text-xs text-stone-500">
                            {pet.breed}
                            {pet.weight ? ` · ${pet.weight} lbs` : ''}
                          </p>
                        </div>
                      </button>
                    ))}
                    {pets.length === 0 && (
                      <p className="text-center text-stone-400 py-4">
                        No pets found. Please add a pet first.
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => setStep(2)}
                    disabled={!selectedPet}
                    className="w-full mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              )}

              {step === 2 && (
                <div>
                  <h3 className="font-medium text-stone-800 mb-3">Select Services</h3>
                  <div className="space-y-2 mb-4">
                    {mainServices.map((svc) => (
                      <button
                        key={svc.id}
                        onClick={() => {
                          setSelectedServices((prev) =>
                            prev.find((s) => s.id === svc.id)
                              ? prev.filter((s) => s.id !== svc.id)
                              : [...prev, svc]
                          );
                        }}
                        className={`w-full flex items-center justify-between p-3 rounded-xl border text-left ${
                          selectedServices.find((s) => s.id === svc.id)
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-stone-200 hover:border-stone-300'
                        }`}
                      >
                        <div>
                          <p className="font-medium text-stone-800 text-sm">{svc.name}</p>
                          {svc.description && (
                            <p className="text-xs text-stone-500">{svc.description}</p>
                          )}
                        </div>
                        <div className="text-right shrink-0 ml-3">
                          <p className="text-sm font-medium text-stone-700">
                            {svc.priceRange || `$${svc.price}`}
                          </p>
                          <p className="text-xs text-stone-400">{svc.duration} min</p>
                        </div>
                      </button>
                    ))}
                  </div>
                  {selectedServices.length > 0 && addOnServices.length > 0 && (
                    <>
                      <h4 className="font-medium text-stone-700 text-sm mb-2">
                        Add-ons (optional)
                      </h4>
                      <div className="space-y-2 mb-4">
                        {addOnServices.map((svc) => (
                          <button
                            key={svc.id}
                            onClick={() => {
                              setSelectedAddOns((prev) =>
                                prev.find((s) => s.id === svc.id)
                                  ? prev.filter((s) => s.id !== svc.id)
                                  : [...prev, svc]
                              );
                            }}
                            className={`w-full flex items-center justify-between p-2.5 rounded-lg border text-left text-sm ${
                              selectedAddOns.find((s) => s.id === svc.id)
                                ? 'border-blue-500 bg-blue-50'
                                : 'border-stone-200 hover:border-stone-300'
                            }`}
                          >
                            <div>
                              <p className="font-medium text-stone-800">{svc.name}</p>
                              {svc.description && (
                                <p className="text-xs text-stone-500">{svc.description}</p>
                              )}
                            </div>
                            <span className="text-stone-600 shrink-0 ml-3">
                              {svc.priceRange || `$${svc.price}`}
                            </span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                  <div className="flex gap-2 mt-4">
                    <button
                      onClick={() => setStep(1)}
                      className="flex-1 px-4 py-2 border border-stone-200 rounded-lg text-sm"
                    >
                      Back
                    </button>
                    <button
                      onClick={() => setStep(3)}
                      disabled={selectedServices.length === 0}
                      className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div>
                  <h3 className="font-medium text-stone-800 mb-3">Select Groomer</h3>
                  <div className="space-y-2">
                    <button
                      onClick={() => setStep(4)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left ${
                        selectedGroomer === 'first-available'
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-stone-200 hover:border-stone-300'
                      }`}
                    >
                      <div className="w-10 h-10 rounded-full bg-stone-100 flex items-center justify-center">
                        First
                      </div>
                      <div>
                        <p className="font-medium text-stone-800">First Available</p>
                        <p className="text-xs text-stone-500">
                          We will match you with the best available groomer
                        </p>
                      </div>
                    </button>
                  </div>
                  <p className="text-xs text-stone-400 mt-3">
                    Note: Groomer listing not available. Showing "First Available" only.
                  </p>
                  <div className="flex gap-2 mt-4">
                    <button
                      onClick={() => setStep(2)}
                      className="flex-1 px-4 py-2 border border-stone-200 rounded-lg text-sm"
                    >
                      Back
                    </button>
                    <button
                      onClick={() => setStep(4)}
                      className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}

              {step === 4 && (
                <div>
                  <h3 className="font-medium text-stone-800 mb-3">Pick Date & Time</h3>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm mb-3"
                  />
                  {selectedDate && (
                    <div className="grid grid-cols-3 gap-2 mb-4">
                      {availableTimes.map((time) => (
                        <button
                          key={time}
                          onClick={() => setSelectedTime(time)}
                          className={`px-3 py-2 rounded-lg text-sm border ${
                            selectedTime === time
                              ? 'border-blue-500 bg-blue-50 font-medium'
                              : 'border-stone-200 hover:border-stone-300'
                          }`}
                        >
                          {time}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="mb-4">
                    <label className="flex items-center gap-2 text-sm text-stone-700 mb-1">
                      Recurring (optional)
                    </label>
                    <select
                      value={recurring}
                      onChange={(e) => setRecurring(e.target.value)}
                      className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="">One-time</option>
                      <option value="4">Every 4 weeks</option>
                      <option value="6">Every 6 weeks</option>
                      <option value="8">Every 8 weeks</option>
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setStep(3)}
                      className="flex-1 px-4 py-2 border border-stone-200 rounded-lg text-sm"
                    >
                      Back
                    </button>
                    <button
                      onClick={() => setStep(5)}
                      disabled={!selectedDate || !selectedTime}
                      className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}

              {step === 5 && (
                <div>
                  <h3 className="font-medium text-stone-800 mb-3">Review & Confirm</h3>
                  <div className="bg-stone-50 rounded-xl p-4 space-y-2 text-sm mb-4">
                    <div className="flex justify-between">
                      <span className="text-stone-500">Pet</span>
                      <span className="font-medium">{selectedPet?.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-stone-500">Services</span>
                      <span className="font-medium">
                        {selectedServices.map((s) => s.name).join(', ')}
                      </span>
                    </div>
                    {selectedAddOns.length > 0 && (
                      <div className="flex justify-between">
                        <span className="text-stone-500">Add-ons</span>
                        <span className="font-medium">
                          {selectedAddOns.map((s) => s.name).join(', ')}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-stone-500">Groomer</span>
                      <span className="font-medium">First Available</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-stone-500">Date & Time</span>
                      <span className="font-medium">
                        {formatDate(selectedDate)} at {selectedTime}
                      </span>
                    </div>
                    {recurring && (
                      <div className="flex justify-between">
                        <span className="text-stone-500">Recurring</span>
                        <span className="font-medium">Every {recurring} weeks</span>
                      </div>
                    )}
                  </div>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-stone-700 mb-1">
                      Notes for groomer (optional)
                    </label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm"
                      rows={2}
                      placeholder="Any special instructions..."
                    />
                  </div>
                  {error && (
                    <div className="bg-red-50 rounded-lg px-3 py-2 text-xs text-red-700 mb-4">
                      {error}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => setStep(4)}
                      className="flex-1 px-4 py-2 border border-stone-200 rounded-lg text-sm"
                    >
                      Back
                    </button>
                    <button
                      onClick={handleConfirmBooking}
                      disabled={submitting}
                      className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                    >
                      {submitting ? 'Booking...' : 'Confirm Booking'}
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