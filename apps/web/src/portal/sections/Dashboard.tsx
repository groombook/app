import { Calendar, Clock, PawPrint, CreditCard, Star, ChevronRight, AlertTriangle } from "lucide-react";
import { PETS, UPCOMING_APPOINTMENTS, PAST_APPOINTMENTS, INVOICES, LOYALTY, BUSINESS_NAME } from "../mockData.js";

interface Props {
  onNavigate: (section: "appointments" | "pets" | "billing" | "reports") => void;
  readOnly: boolean;
}

function daysUntil(dateStr: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export function Dashboard({ onNavigate, readOnly }: Props) {
  const nextAppt = UPCOMING_APPOINTMENTS[0];
  const outstanding = INVOICES.filter(i => i.status === "outstanding").reduce((sum, i) => sum + i.amount, 0);
  const recentEvents = [
    ...PAST_APPOINTMENTS.slice(0, 3).map(a => ({
      id: a.id, date: a.date, text: `${a.petName} — ${a.services.join(", ")}`, type: "appointment" as const,
    })),
    ...INVOICES.filter(i => i.status === "paid").slice(0, 2).map(i => ({
      id: i.id, date: i.date, text: `Invoice paid — $${i.amount}`, type: "payment" as const,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div>
        <h2 className="text-2xl font-semibold text-stone-800">Welcome back, Sarah</h2>
        <p className="text-stone-500 text-sm mt-1">Here's what's happening at {BUSINESS_NAME}</p>
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
                {nextAppt.petName} with {nextAppt.groomerName}
              </p>
              <p className="text-stone-600 text-sm mt-1">
                {nextAppt.services.join(", ")}
                {nextAppt.addOns.length > 0 && ` + ${nextAppt.addOns.join(", ")}`}
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
              <div className="text-3xl font-bold text-(--color-accent-dark)">{daysUntil(nextAppt.date)}</div>
              <div className="text-xs text-stone-500">days away</div>
            </div>
          </div>
          {!readOnly && (
            <div className="flex gap-2 mt-4">
              <button
                type="button"
                className="text-sm px-3 py-1.5 border border-stone-200 rounded-lg text-stone-600 hover:bg-stone-50"
                onClick={() => alert("Rescheduling is coming soon!")}
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
        {PETS.map(pet => {
          const expiringVax = pet.vaccinations.filter(v => v.status !== "valid");
          return (
            <button
              key={pet.id}
              onClick={() => onNavigate("pets")}
              className="bg-white rounded-2xl border border-stone-200 p-4 shadow-sm text-left hover:border-stone-300 transition-colors"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 rounded-full bg-(--color-accent-light) flex items-center justify-center text-2xl">
                  {pet.photo}
                </div>
                <div>
                  <p className="font-semibold text-stone-800">{pet.name}</p>
                  <p className="text-xs text-stone-500">{pet.breed} · {pet.weight} lbs</p>
                </div>
              </div>
              {expiringVax.length > 0 ? (
                <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded-lg">
                  <AlertTriangle size={12} />
                  {expiringVax.map(v => v.name).join(", ")} {expiringVax[0]?.status === "expired" ? "expired" : "expiring soon"}
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-xs text-green-700 bg-green-50 px-2 py-1 rounded-lg">
                  <PawPrint size={12} />
                  All vaccinations current
                </div>
              )}
            </button>
          );
        })}

        {/* Loyalty Card */}
        <div className="bg-white rounded-2xl border border-stone-200 p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-medium text-(--color-accent-dark) mb-3">
            <Star size={16} />
            Loyalty Rewards
          </div>
          <p className="text-2xl font-bold text-stone-800">{LOYALTY.points} <span className="text-sm font-normal text-stone-500">pts</span></p>
          <div className="mt-2 bg-stone-100 rounded-full h-2 overflow-hidden">
            <div
              className="bg-(--color-accent) h-full rounded-full transition-all"
              style={{ width: `${(LOYALTY.points / LOYALTY.nextRewardAt) * 100}%` }}
            />
          </div>
          <p className="text-xs text-stone-500 mt-1">
            {LOYALTY.nextRewardAt - LOYALTY.points} pts to {LOYALTY.rewardName}
          </p>
        </div>
      </div>

      {/* Outstanding Balance & Recent Activity */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Outstanding Balance */}
        {outstanding > 0 && (
          <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 text-sm font-medium text-stone-500 mb-1">
                  <CreditCard size={16} />
                  Outstanding Balance
                </div>
                <p className="text-2xl font-bold text-stone-800">${outstanding.toFixed(2)}</p>
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
          </div>
        )}

        {/* Recent Activity */}
        <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
          <h3 className="text-sm font-medium text-stone-500 mb-3">Recent Activity</h3>
          <div className="space-y-2.5">
            {recentEvents.map(evt => (
              <div key={evt.id} className="flex items-center gap-3 text-sm">
                <div className={`w-2 h-2 rounded-full shrink-0 ${evt.type === "payment" ? "bg-green-400" : "bg-(--color-accent)"}`} />
                <span className="text-stone-600 flex-1">{evt.text}</span>
                <span className="text-xs text-stone-400">{formatDate(evt.date)}</span>
              </div>
            ))}
          </div>
          <button
            onClick={() => onNavigate("appointments")}
            className="flex items-center gap-1 text-sm text-(--color-accent-dark) font-medium mt-3 hover:text-(--color-accent)"
          >
            View all <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
