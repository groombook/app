import { useState, useEffect } from "react";
import { FileText, Share2, Calendar, Smile, Meh, ChevronRight, Loader2 } from "lucide-react";

type MoodKey = "calm" | "cooperative" | "anxious" | "wiggly";

const MOOD_CONFIG: Record<MoodKey, { icon: typeof Smile; label: string; color: string; bg: string }> = {
  calm: { icon: Smile, label: "Calm & Relaxed", color: "text-green-700", bg: "bg-green-100" },
  cooperative: { icon: Smile, label: "Cooperative", color: "text-blue-700", bg: "bg-blue-100" },
  anxious: { icon: Meh, label: "Anxious", color: "text-amber-700", bg: "bg-amber-100" },
  wiggly: { icon: Meh, label: "Wiggly", color: "text-purple-700", bg: "bg-purple-100" },
};

interface Appointment {
  id: string;
  petId: string;
  serviceId: string;
  groomerId: string | null;
  date: string;
  time: string;
  status: string;
  petName?: string;
  serviceName?: string;
  groomerName?: string;
  reportCardId?: string;
}

export function ReportCards() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCard, setSelectedCard] = useState<Appointment | null>(null);

  useEffect(() => {
    const fetchReportCards = async () => {
      try {
        const response = await fetch("/api/portal/appointments");

        if (response.ok) {
          const data = await response.json();
          const allAppointments: Appointment[] = data.appointments || data || [];
          const reportCardAppointments = allAppointments.filter(
            (appt) => appt.reportCardId
          );
          setAppointments(reportCardAppointments);
        } else {
          setError("Failed to load report cards.");
        }
      } catch {
        setError("Failed to load report cards. Please try again.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchReportCards();
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-stone-400" size={24} />
        <span className="ml-3 text-stone-500">Loading report cards...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 mb-4">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-stone-100 text-stone-700 rounded-md hover:bg-stone-200"
        >
          Retry
        </button>
      </div>
    );
  }

  if (appointments.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-stone-100 flex items-center justify-center">
          <FileText size={24} className="text-stone-400" />
        </div>
        <h3 className="text-lg font-medium text-stone-800 mb-1">No Report Cards Yet</h3>
        <p className="text-sm text-stone-500">
          Report cards from your grooming visits will appear here after your appointments.
        </p>
      </div>
    );
  }

  if (selectedCard) {
    return <ReportCardDetail card={selectedCard} onBack={() => setSelectedCard(null)} />;
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-stone-500">Grooming report cards from your recent visits</p>

      <div className="space-y-4">
        {appointments.map((card) => {
          const moodKey: MoodKey = "cooperative";
          const mood = MOOD_CONFIG[moodKey];
          const MoodIcon = mood.icon;
          return (
            <button
              key={card.id}
              onClick={() => setSelectedCard(card)}
              className="w-full bg-white rounded-2xl border border-stone-200 p-5 shadow-sm text-left hover:border-stone-300 transition-colors"
            >
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-xl bg-(--color-accent-light) flex items-center justify-center text-(--color-accent)">
                  <FileText size={24} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-stone-800">{card.petName || "Pet"}'s Report Card</h3>
                    <ChevronRight size={16} className="text-stone-400" />
                  </div>
                  <p className="text-sm text-stone-500 mt-0.5">
                    {card.serviceName || "Grooming"} with {card.groomerName || "your groomer"}
                  </p>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="flex items-center gap-1 text-xs text-stone-400">
                      <Calendar size={12} />
                      {new Date(card.date).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                    <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${mood.bg} ${mood.color}`}>
                      <MoodIcon size={12} />
                      {mood.label}
                    </span>
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ReportCardDetail({ card, onBack }: { card: Appointment; onBack: () => void }) {
  const moodKey: MoodKey = "cooperative";
  const mood = MOOD_CONFIG[moodKey];
  const MoodIcon = mood.icon;

  return (
    <div className="space-y-6">
      <button
        onClick={onBack}
        className="text-sm text-(--color-accent-dark) font-medium hover:underline"
      >
        Back to Report Cards
      </button>

      <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-(--color-accent-lighter) to-(--color-accent-light) p-6">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-xl font-semibold text-stone-800">
              {card.petName || "Pet"}'s Grooming Report
            </h2>
            <button className="flex items-center gap-1.5 px-3 py-1.5 bg-white/80 text-stone-700 rounded-lg text-sm font-medium hover:bg-white">
              <Share2 size={14} />
              Share
            </button>
          </div>
          <p className="text-sm text-stone-600">
            {new Date(card.date).toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
            {card.groomerName ? ` · Groomer: ${card.groomerName}` : ""}
          </p>
        </div>

        <div className="p-6 space-y-6">
          {/* Before & After */}
          <div>
            <h3 className="font-medium text-stone-800 mb-3">Before & After</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-xl bg-stone-50 p-4">
                <p className="text-xs font-medium text-stone-400 uppercase mb-2">Before</p>
                <div className="w-full h-32 bg-stone-200 rounded-lg flex items-center justify-center text-stone-400 text-sm mb-2">
                  Photo placeholder
                </div>
                <p className="text-sm text-stone-600">Before photo description not available.</p>
              </div>
              <div className="rounded-xl bg-(--color-accent-lighter) p-4">
                <p className="text-xs font-medium text-(--color-accent) uppercase mb-2">After</p>
                <div className="w-full h-32 bg-(--color-accent-light) rounded-lg flex items-center justify-center text-(--color-accent) text-sm mb-2">
                  Photo placeholder
                </div>
                <p className="text-sm text-stone-700">After photo description not available.</p>
              </div>
            </div>
          </div>

          {/* Services */}
          <div>
            <h3 className="font-medium text-stone-800 mb-2">Services Performed</h3>
            <div className="flex flex-wrap gap-2">
              <span className="px-3 py-1 bg-stone-100 rounded-full text-sm text-stone-700">
                {card.serviceName || "Grooming"}
              </span>
            </div>
          </div>

          {/* Behavior */}
          <div>
            <h3 className="font-medium text-stone-800 mb-2">Behavior & Mood</h3>
            <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl ${mood.bg}`}>
              <MoodIcon size={20} className={mood.color} />
              <span className={`font-medium ${mood.color}`}>{mood.label}</span>
            </div>
          </div>

          {/* Groomer's Note */}
          <div className="bg-(--color-accent-lighter) rounded-xl p-4">
            <h3 className="font-medium text-stone-800 mb-2">
              A Note from {card.groomerName || "Your Groomer"}
            </h3>
            <p className="text-sm text-stone-700 italic leading-relaxed">
              "Report card details are not yet available. Please check back after your visit."
            </p>
          </div>

          {/* Next Appointment CTA */}
          <div className="bg-white border border-stone-200 rounded-xl p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-stone-800">Book your next visit</p>
              <p className="text-xs text-stone-500">Schedule your next grooming appointment</p>
            </div>
            <button
              onClick={() => {
                // TODO: Pre-select the service from report card (serviceId/serviceName) once BookPage supports service pre-selection via URL param
                const params = new URLSearchParams();
                if (card.petName) params.set("petName", card.petName);
                if (card.serviceName) params.set("serviceName", card.serviceName);
                window.location.href = `/admin/book${params.size > 0 ? `?${params.toString()}` : ""}`;
              }}
              className="px-4 py-2 bg-(--color-accent) text-white rounded-lg text-sm font-medium hover:bg-(--color-accent-hover)"
            >
              Rebook Now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
