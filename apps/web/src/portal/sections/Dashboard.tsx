import { useState, useEffect } from "react";
import { Calendar, Clock, PawPrint, CreditCard, Star, ChevronRight, AlertTriangle } from "lucide-react";

interface DashboardProps {
  sessionId: string | null;
  clientName: string;
  onNavigate: (section: "appointments" | "pets" | "billing" | "reports") => void;
  readOnly: boolean;
  onReschedule: (appointmentId: string) => void;
}

interface Appointment {
  id: string;
  date: string;
  time: string;
  petName: string;
  serviceName: string;
  status: string;
  staffName?: string;
  services?: string[];
  addOns?: string[];
  groomerName?: string;
}

interface Pet {
  id: string;
  name: string;
  species: string;
  breed?: string;
  dateOfBirth?: string;
  weight?: number;
  healthAlerts: string[];
  photo?: string;
  vaccinations?: { name: string; status: string }[];
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  date: string;
  amount: number;
  status: string;
  dueDate?: string;
  items: { description: string; price: number }[];
}

interface Branding {
  clinicName: string;
  logoUrl?: string;
  primaryColor: string;
}

function daysUntil(dateStr: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function Dashboard({
  sessionId,
  clientName,
  onNavigate,
  readOnly,
  onReschedule,
}: DashboardProps) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [pets, setPets] = useState<Pet[]>([]);
  const [pendingInvoices, setPendingInvoices] = useState<Invoice[]>([]);
  const [branding, setBranding] = useState<Branding | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!sessionId) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const headers = {
          "x-session-id": sessionId,
        };

        const [appointmentsRes, petsRes, invoicesRes, brandingRes] = await Promise.all([
          fetch("/api/portal/appointments", { headers }),
          fetch("/api/portal/pets", { headers }),
          fetch("/api/portal/invoices", { headers }),
          fetch("/api/branding", { headers }),
        ]);

        if (!appointmentsRes.ok || !petsRes.ok || !invoicesRes.ok || !brandingRes.ok) {
          throw new Error("Failed to fetch dashboard data");
        }

        const appointmentsData = await appointmentsRes.json();
        const petsData = await petsRes.json();
        const invoicesData = await invoicesRes.json();
        const brandingData = await brandingRes.json();

        setAppointments(appointmentsData.appointments || []);
        setPets(petsData.pets || []);

        // Filter for pending invoices only (not "outstanding")
        const pending = (invoicesData.invoices || []).filter(
          (invoice: Invoice) => invoice.status === "pending"
        );
        setPendingInvoices(pending);

        setBranding(brandingData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [sessionId]);

  const getUpcomingAppointments = (): Appointment[] => {
    const now = new Date();
    return appointments
      .filter((apt) => new Date(`${apt.date}T${apt.time}`) >= now)
      .sort(
        (a, b) =>
          new Date(`${a.date}T${a.time}`).getTime() -
          new Date(`${b.date}T${b.time}`).getTime()
      )
      .slice(0, 5);
  };

  const getPetHealthAlerts = (): { petName: string; alert: string }[] => {
    return pets
      .filter((pet) => pet.healthAlerts && pet.healthAlerts.length > 0)
      .flatMap((pet) =>
        pet.healthAlerts.map((alert) => ({ petName: pet.name, alert }))
      );
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  const getPendingBalance = (): number => {
    return pendingInvoices.reduce((sum, invoice) => sum + invoice.amount, 0);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-(--color-accent)" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-5">
          <p className="text-red-700">Error: {error}</p>
        </div>
      </div>
    );
  }

  if (!sessionId) {
    return (
      <div className="space-y-6">
        <div className="bg-stone-100 rounded-2xl p-5 text-center">
          <p className="text-stone-600">Please sign in to view your dashboard.</p>
        </div>
      </div>
    );
  }

  const upcomingAppointments = getUpcomingAppointments();
  const healthAlerts = getPetHealthAlerts();
  const pendingBalance = getPendingBalance();
  const nextAppt = upcomingAppointments[0];

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div>
        <h2 className="text-2xl font-semibold text-stone-800">
          Welcome back, {clientName}
        </h2>
        <p className="text-stone-500 text-sm mt-1">
          Here's what's happening at {branding?.clinicName || "your clinic"}
        </p>
      </div>

      {/* Next Appointment */}
      {nextAppt && (
        <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2 text-sm font-medium text-(--color-accent-dark)">
              <Calendar size={16} />
              Next Appointment
            </div>
            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
              {nextAppt.status}
            </span>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1">
              <p className="text-lg font-semibold text-stone-800">
                {nextAppt.petName}
                {nextAppt.groomerName && ` with ${nextAppt.groomerName}`}
                {nextAppt.staffName && ` with ${nextAppt.staffName}`}
              </p>
              <p className="text-stone-600 text-sm mt-1">
                {nextAppt.services?.join(", ") ||
                  nextAppt.serviceName ||
                  "Appointment"}
                {nextAppt.addOns && nextAppt.addOns.length > 0 &&
                  ` + ${nextAppt.addOns.join(", ")}`}
              </p>
              <div className="flex items-center gap-4 mt-2 text-sm text-stone-500">
                <span className="flex items-center gap-1">
                  <Calendar size={14} />
                  {formatDate(nextAppt.date)}
                </span>
                <span className="flex items-center gap-1">
                  <Clock size={14} />
                  {nextAppt.time}
                </span>
              </div>
            </div>
            <div className="text-center sm:text-right">
              <div className="text-3xl font-bold text-(--color-accent-dark)">
                {daysUntil(nextAppt.date)}
              </div>
              <div className="text-xs text-stone-500">days away</div>
            </div>
          </div>
          {!readOnly && (
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => onReschedule(nextAppt.id)}
                className="text-sm px-3 py-1.5 border border-stone-200 rounded-lg text-stone-600 hover:bg-stone-50"
              >
                Reschedule
              </button>
              <button className="text-sm px-3 py-1.5 border border-stone-200 rounded-lg text-stone-600 hover:bg-stone-50">
                Cancel
              </button>
              <button className="text-sm px-3 py-1.5 border border-stone-200 rounded-lg text-stone-600 hover:bg-stone-50">
                Add Notes
              </button>
            </div>
          )}
        </div>
      )}

      {/* Pet Cards & Loyalty */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Pet Cards */}
        {pets.map((pet) => {
          const petAlerts = pet.healthAlerts || [];
          return (
            <button
              key={pet.id}
              onClick={() => onNavigate("pets")}
              className="bg-white rounded-2xl border border-stone-200 p-4 shadow-sm text-left hover:border-stone-300 transition-colors"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 rounded-full bg-(--color-accent-light) flex items-center justify-center text-2xl">
                  {pet.photo || pet.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="font-semibold text-stone-800">{pet.name}</p>
                  <p className="text-xs text-stone-500">
                    {pet.breed || pet.species}
                    {pet.weight && ` · ${pet.weight} lbs`}
                  </p>
                </div>
              </div>
              {petAlerts.length > 0 ? (
                <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded-lg">
                  <AlertTriangle size={12} />
                  {petAlerts.join(", ")}
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-xs text-green-700 bg-green-50 px-2 py-1 rounded-lg">
                  <PawPrint size={12} />
                  All health records current
                </div>
              )}
            </button>
          );
        })}

        {/* Loyalty Card Placeholder */}
        <div className="bg-white rounded-2xl border border-stone-200 p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-medium text-(--color-accent-dark) mb-3">
            <Star size={16} />
            Loyalty Rewards
          </div>
          <div className="flex flex-col items-center justify-center py-4">
            <div className="w-16 h-16 rounded-full bg-(--color-accent-light) flex items-center justify-center mb-3">
              <Star size={32} className="text-(--color-accent)" />
            </div>
            <p className="text-lg font-bold text-stone-800">Coming Soon</p>
            <p className="text-xs text-stone-500 text-center mt-1">
              Earn points with every visit and redeem for exclusive rewards
            </p>
          </div>
        </div>
      </div>

      {/* Pending Balance & Recent Activity */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Pending Invoices */}
        {pendingInvoices.length > 0 && (
          <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="flex items-center gap-2 text-sm font-medium text-stone-500 mb-1">
                  <CreditCard size={16} />
                  Pending Invoices
                </div>
                <p className="text-2xl font-bold text-stone-800">
                  {formatCurrency(pendingBalance)}
                </p>
              </div>
              {!readOnly && (
                <button
                  onClick={() => onNavigate("billing")}
                  className="px-4 py-2 bg-(--color-accent) text-white rounded-lg text-sm font-medium hover:bg-(--color-accent-hover)"
                >
                  Pay Now
                </button>
              )}
            </div>
            <div className="space-y-2">
              {pendingInvoices.slice(0, 3).map((invoice) => (
                <div
                  key={invoice.id}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-stone-600">
                    {invoice.invoiceNumber} - {formatCurrency(invoice.amount)}
                  </span>
                  <span className="text-xs text-stone-400">
                    Due {invoice.dueDate ? formatDate(invoice.dueDate) : formatDate(invoice.date)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Health Alerts */}
        {healthAlerts.length > 0 && (
          <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-medium text-amber-700 mb-3">
              <AlertTriangle size={16} />
              Health Alerts
            </div>
            <div className="space-y-2">
              {healthAlerts.slice(0, 5).map((item, index) => (
                <div key={index} className="flex items-center gap-3 text-sm">
                  <div className="w-2 h-2 rounded-full shrink-0 bg-amber-400" />
                  <span className="text-stone-600 flex-1">
                    <span className="font-medium">{item.petName}:</span>{" "}
                    {item.alert}
                  </span>
                </div>
              ))}
            </div>
            <button
              onClick={() => onNavigate("pets")}
              className="flex items-center gap-1 text-sm text-(--color-accent-dark) font-medium mt-3 hover:text-(--color-accent)"
            >
              View all <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}