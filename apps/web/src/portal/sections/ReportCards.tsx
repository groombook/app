import { useState } from "react";
import { FileText, Share2, Calendar, Smile, Meh, AlertCircle, ChevronRight } from "lucide-react";
import { REPORT_CARDS } from "../mockData.js";
import type { ReportCard } from "../mockData.js";

type MoodKey = "calm" | "cooperative" | "anxious" | "wiggly";
const MOOD_CONFIG: Record<MoodKey, { icon: typeof Smile; label: string; color: string; bg: string }> = {
  calm: { icon: Smile, label: "Calm & Relaxed", color: "text-green-700", bg: "bg-green-100" },
  cooperative: { icon: Smile, label: "Cooperative", color: "text-blue-700", bg: "bg-blue-100" },
  anxious: { icon: Meh, label: "Anxious", color: "text-amber-700", bg: "bg-amber-100" },
  wiggly: { icon: Meh, label: "Wiggly", color: "text-purple-700", bg: "bg-purple-100" },
};

export function ReportCards() {
  const [selectedCard, setSelectedCard] = useState<ReportCard | null>(null);

  if (selectedCard) {
    return <ReportCardDetail card={selectedCard} onBack={() => setSelectedCard(null)} />;
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-stone-500">Grooming report cards from your recent visits</p>

      <div className="space-y-4">
        {REPORT_CARDS.map(card => {
          const mood = MOOD_CONFIG[card.behaviorMood];
          const MoodIcon = mood.icon;
          return (
            <button
              key={card.id}
              onClick={() => setSelectedCard(card)}
              className="w-full bg-white rounded-2xl border border-stone-200 p-5 shadow-sm text-left hover:border-stone-300 transition-colors"
            >
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-xl bg-[#f0ebe4] flex items-center justify-center text-[#8b7355]">
                  <FileText size={24} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-stone-800">{card.petName}'s Report Card</h3>
                    <ChevronRight size={16} className="text-stone-400" />
                  </div>
                  <p className="text-sm text-stone-500 mt-0.5">
                    {card.servicesPerformed.join(", ")} with {card.groomerName}
                  </p>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="flex items-center gap-1 text-xs text-stone-400">
                      <Calendar size={12} />
                      {new Date(card.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
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

function ReportCardDetail({ card, onBack }: { card: ReportCard; onBack: () => void }) {
  const mood = MOOD_CONFIG[card.behaviorMood];
  const MoodIcon = mood.icon;

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="text-sm text-[#6b5a42] font-medium hover:underline">
        ← Back to Report Cards
      </button>

      <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#f0ebe4] to-[#e8e0d5] p-6">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-xl font-semibold text-stone-800">{card.petName}'s Grooming Report</h2>
            <button className="flex items-center gap-1.5 px-3 py-1.5 bg-white/80 text-stone-700 rounded-lg text-sm font-medium hover:bg-white">
              <Share2 size={14} />
              Share
            </button>
          </div>
          <p className="text-sm text-stone-600">
            {new Date(card.date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })} · Groomer: {card.groomerName}
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
                <p className="text-sm text-stone-600">{card.beforeDescription}</p>
              </div>
              <div className="rounded-xl bg-[#faf5ef] p-4">
                <p className="text-xs font-medium text-[#8b7355] uppercase mb-2">After</p>
                <div className="w-full h-32 bg-[#f0ebe4] rounded-lg flex items-center justify-center text-[#8b7355] text-sm mb-2">
                  Photo placeholder
                </div>
                <p className="text-sm text-stone-700">{card.afterDescription}</p>
              </div>
            </div>
          </div>

          {/* Services */}
          <div>
            <h3 className="font-medium text-stone-800 mb-2">Services Performed</h3>
            <div className="flex flex-wrap gap-2">
              {card.servicesPerformed.map(s => (
                <span key={s} className="px-3 py-1 bg-stone-100 rounded-full text-sm text-stone-700">
                  {s}
                </span>
              ))}
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

          {/* Condition Observations */}
          {card.conditionObservations.length > 0 && (
            <div>
              <h3 className="font-medium text-stone-800 mb-2">Condition Observations</h3>
              <div className="space-y-2">
                {card.conditionObservations.map((obs, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <AlertCircle size={16} className="text-amber-500 mt-0.5 shrink-0" />
                    <span className="text-stone-700">{obs}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Groomer's Note */}
          <div className="bg-[#faf5ef] rounded-xl p-4">
            <h3 className="font-medium text-stone-800 mb-2">A Note from {card.groomerName}</h3>
            <p className="text-sm text-stone-700 italic leading-relaxed">"{card.groomerNote}"</p>
          </div>

          {/* Next Appointment CTA */}
          <div className="bg-white border border-stone-200 rounded-xl p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-stone-800">Next recommended visit</p>
              <p className="text-xs text-stone-500">
                {new Date(card.nextRecommendedDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
              </p>
            </div>
            <button className="px-4 py-2 bg-[#8b7355] text-white rounded-lg text-sm font-medium hover:bg-[#7a6549]">
              Rebook Now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
