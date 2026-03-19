import { useState } from "react";
import { PawPrint, Heart, Scissors, Syringe, AlertTriangle, CheckCircle, Clock, Upload, Edit3 } from "lucide-react";
import { PETS, PAST_APPOINTMENTS } from "../mockData.js";
import type { Pet } from "../mockData.js";

interface Props {
  readOnly: boolean;
}

type VaxStatus = "valid" | "expiring" | "expired";
const VAX_STATUS_STYLES: Record<VaxStatus, { bg: string; text: string; icon: typeof CheckCircle }> = {
  valid: { bg: "bg-green-100", text: "text-green-700", icon: CheckCircle },
  expiring: { bg: "bg-amber-100", text: "text-amber-700", icon: Clock },
  expired: { bg: "bg-red-100", text: "text-red-700", icon: AlertTriangle },
};

export function PetProfiles({ readOnly }: Props) {
  const [selectedPetId, setSelectedPetId] = useState<string>(PETS[0]?.id ?? "");
  const [activeTab, setActiveTab] = useState<"info" | "medical" | "grooming" | "vaccinations" | "history">("info");

  const pet = PETS.find(p => p.id === selectedPetId)!;
  const petHistory = PAST_APPOINTMENTS.filter(a => a.petId === selectedPetId);

  return (
    <div className="space-y-6">
      {/* Pet Selector */}
      <div className="flex gap-3">
        {PETS.map(p => (
          <button
            key={p.id}
            onClick={() => { setSelectedPetId(p.id); setActiveTab("info"); }}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${
              p.id === selectedPetId ? "border-[#8b7355] bg-[#faf5ef]" : "border-stone-200 bg-white hover:border-stone-300"
            }`}
          >
            <span className="text-2xl">{p.photo}</span>
            <div className="text-left">
              <p className="font-medium text-stone-800 text-sm">{p.name}</p>
              <p className="text-xs text-stone-500">{p.breed}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Profile Header */}
      <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-2xl bg-[#f0ebe4] flex items-center justify-center text-4xl">
            {pet.photo}
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-semibold text-stone-800">{pet.name}</h2>
            <p className="text-stone-500 text-sm">{pet.breed} · {pet.weight} lbs · {pet.sex === "male" ? "♂" : "♀"} {pet.spayedNeutered ? "(spayed/neutered)" : ""}</p>
            <p className="text-stone-400 text-xs mt-0.5">Born {new Date(pet.dob).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>
          </div>
          {!readOnly && (
            <button className="p-2 hover:bg-stone-50 rounded-lg">
              <Edit3 size={16} className="text-stone-400" />
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white rounded-xl border border-stone-200 p-1 overflow-x-auto">
        {([
          { id: "info", label: "Basic Info", icon: PawPrint },
          { id: "medical", label: "Medical", icon: Heart },
          { id: "grooming", label: "Grooming", icon: Scissors },
          { id: "vaccinations", label: "Vaccinations", icon: Syringe },
          { id: "history", label: "History", icon: Clock },
        ] as const).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${
              activeTab === id ? "bg-[#f0ebe4] text-[#6b5a42]" : "text-stone-500 hover:text-stone-700"
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
        {activeTab === "info" && <BasicInfoTab pet={pet} readOnly={readOnly} />}
        {activeTab === "medical" && <MedicalTab pet={pet} readOnly={readOnly} />}
        {activeTab === "grooming" && <GroomingTab pet={pet} readOnly={readOnly} />}
        {activeTab === "vaccinations" && <VaccinationsTab pet={pet} readOnly={readOnly} />}
        {activeTab === "history" && <HistoryTab petHistory={petHistory} />}
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center py-2.5 border-b border-stone-100 last:border-0">
      <span className="text-sm text-stone-500 sm:w-40 shrink-0">{label}</span>
      <span className="text-sm text-stone-800">{value}</span>
    </div>
  );
}

function BasicInfoTab({ pet, readOnly }: { pet: Pet; readOnly: boolean }) {
  return (
    <div>
      <InfoRow label="Name" value={pet.name} />
      <InfoRow label="Breed" value={pet.breed} />
      <InfoRow label="Weight" value={`${pet.weight} lbs`} />
      <InfoRow label="Date of Birth" value={new Date(pet.dob).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} />
      <InfoRow label="Sex" value={pet.sex === "male" ? "Male" : "Female"} />
      <InfoRow label="Spayed/Neutered" value={pet.spayedNeutered ? "Yes" : "No"} />
      {!readOnly && (
        <button className="mt-4 text-sm text-[#6b5a42] font-medium hover:underline">
          Upload Photo
        </button>
      )}
    </div>
  );
}

function MedicalTab({ pet, readOnly }: { pet: Pet; readOnly: boolean }) {
  return (
    <div>
      <InfoRow label="Allergies" value={pet.allergies} />
      <InfoRow label="Skin Conditions" value={pet.skinConditions} />
      <InfoRow label="Anxiety Triggers" value={pet.anxietyTriggers} />
      <InfoRow label="Aggression Notes" value={pet.aggressionNotes} />
      <InfoRow label="Mobility Issues" value={pet.mobilityIssues} />
      <InfoRow label="Medications" value={pet.medications} />
      {!readOnly && (
        <p className="mt-3 text-xs text-stone-400">
          Changes to medical notes will be flagged for staff review.
        </p>
      )}
    </div>
  );
}

function GroomingTab({ pet, readOnly }: { pet: Pet; readOnly: boolean }) {
  return (
    <div>
      <InfoRow label="Preferred Cut" value={pet.preferredCut} />
      <InfoRow label="Shampoo Preference" value={pet.shampooPreference} />
      <InfoRow label="Sensitive Areas" value={pet.sensitiveAreas} />
      <InfoRow label="Standing Instructions" value={pet.standingInstructions} />
      {!readOnly && (
        <button className="mt-4 text-sm text-[#6b5a42] font-medium hover:underline">
          Upload Reference Photo
        </button>
      )}
    </div>
  );
}

function VaccinationsTab({ pet, readOnly }: { pet: Pet; readOnly: boolean }) {
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-stone-400 border-b border-stone-100">
              <th className="pb-2 font-medium">Vaccine</th>
              <th className="pb-2 font-medium">Administered</th>
              <th className="pb-2 font-medium">Expires</th>
              <th className="pb-2 font-medium">Status</th>
              <th className="pb-2 font-medium">Proof</th>
            </tr>
          </thead>
          <tbody>
            {pet.vaccinations.map(vax => {
              const style = VAX_STATUS_STYLES[vax.status];
              const StatusIcon = style.icon;
              return (
                <tr key={vax.name} className="border-b border-stone-50">
                  <td className="py-2.5 font-medium text-stone-800">{vax.name}</td>
                  <td className="py-2.5 text-stone-600">{new Date(vax.lastAdministered).toLocaleDateString()}</td>
                  <td className="py-2.5 text-stone-600">{new Date(vax.expirationDate).toLocaleDateString()}</td>
                  <td className="py-2.5">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${style.bg} ${style.text}`}>
                      <StatusIcon size={12} />
                      {vax.status}
                    </span>
                  </td>
                  <td className="py-2.5">
                    {vax.documentUploaded ? (
                      <span className="text-green-600 text-xs">Uploaded</span>
                    ) : !readOnly ? (
                      <button className="flex items-center gap-1 text-xs text-[#6b5a42] hover:underline">
                        <Upload size={12} />
                        Upload
                      </button>
                    ) : (
                      <span className="text-stone-400 text-xs">Missing</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function HistoryTab({ petHistory }: { petHistory: typeof PAST_APPOINTMENTS }) {
  return (
    <div className="space-y-3">
      {petHistory.length === 0 ? (
        <p className="text-sm text-stone-400 text-center py-4">No history yet</p>
      ) : (
        petHistory.map(appt => (
          <div key={appt.id} className="flex items-center gap-3 py-2 border-b border-stone-50 last:border-0">
            <div className="w-8 h-8 rounded-lg bg-stone-100 flex items-center justify-center text-xs text-stone-500">
              <Scissors size={14} />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-stone-800">{appt.services.join(", ")}</p>
              <p className="text-xs text-stone-500">with {appt.groomerName} · ${appt.price}</p>
            </div>
            <span className="text-xs text-stone-400">
              {new Date(appt.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </span>
            {appt.reportCardId && (
              <span className="text-xs text-[#6b5a42] font-medium">Report →</span>
            )}
          </div>
        ))
      )}
    </div>
  );
}
