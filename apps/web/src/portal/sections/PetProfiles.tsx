import { useState, useEffect } from "react";
import { PawPrint, Heart, Scissors, Clock, Edit3, Loader2 } from "lucide-react";
import { PetForm } from "./PetForm.js";

interface Pet {
  id: string;
  name: string;
  breed: string;
  weight: number;
  birthDate: string;
  photoUrl: string | null;
  notes: string | null;
}

interface Appointment {
  id: string;
  startTime: string;
  endTime: string;
  status: string;
  confirmationStatus: string | null;
  customerNotes: string | null;
  groomerNotes: string | null;
  reportCardId: string | null;
  pet: { id: string; name: string; photo: string | null } | null;
  service: { id: string } | null;
  staff: { id: string; name: string } | null;
}

interface AppointmentsResponse {
  upcoming: Appointment[];
  past: Appointment[];
}

interface Props {
  sessionId: string | null;
  readOnly: boolean;
}

function buildHeaders(sessionId: string | null): Record<string, string> {
  const headers: Record<string, string> = {};
  if (sessionId) {
    headers["X-Impersonation-Session-Id"] = sessionId;
  }
  return headers;
}

export function PetProfiles({ sessionId, readOnly }: Props) {
  const [pets, setPets] = useState<Pet[]>([]);
  const [appointments, setAppointments] = useState<AppointmentsResponse>({ upcoming: [], past: [] });
  const [selectedPetId, setSelectedPetId] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"info" | "medical" | "grooming" | "history">("info");
  const [editingPetId, setEditingPetId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const [petsRes, apptsRes] = await Promise.all([
          fetch("/api/portal/pets", { headers: buildHeaders(sessionId) }),
          fetch("/api/portal/appointments", { headers: buildHeaders(sessionId) }),
        ]);

        if (!petsRes.ok) {
          throw new Error("Failed to load pets");
        }
        if (!apptsRes.ok) {
          throw new Error("Failed to load appointments");
        }

        const petsData = await petsRes.json();
        const apptsData = await apptsRes.json();

        setPets(petsData.map((p: { id: string; name: string; breed: string; weightKg: number; dateOfBirth: string; photoKey: string | null; groomingNotes: string | null }) => ({
          id: p.id,
          name: p.name,
          breed: p.breed,
          weight: p.weightKg,
          birthDate: p.dateOfBirth,
          photoUrl: p.photoKey ?? null,
          notes: p.groomingNotes ?? null,
        })));
        setAppointments({ upcoming: apptsData?.upcoming || [], past: apptsData?.past || [] });

        if (petsData.length > 0 && !selectedPetId) {
          setSelectedPetId(petsData[0].id);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load data");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [sessionId]);

  const selectedPet = pets.find(p => p.id === selectedPetId) ?? null;
  const petHistory = appointments.past.filter(a => a.pet?.id === selectedPetId);
  const editingPet = editingPetId ? pets.find(p => p.id === editingPetId) ?? null : null;

  function handlePetSave(updatedPet: Pet) {
    setPets(prev => prev.map(p => p.id === updatedPet.id ? updatedPet : p));
    setEditingPetId(null);
  }

  if (editingPet) {
    return (
      <PetForm
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        pet={editingPet as any}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onSave={handlePetSave as any}
        onCancel={() => setEditingPetId(null)}
      />
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={24} className="animate-spin text-stone-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500 text-sm">{error}</p>
      </div>
    );
  }

  if (pets.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-stone-400 text-sm">No pets found</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Pet Selector */}
      <div className="flex gap-3 overflow-x-auto pb-1">
        {pets.map(p => (
          <button
            key={p.id}
            onClick={() => { setSelectedPetId(p.id); setActiveTab("info"); }}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors shrink-0 ${
              p.id === selectedPetId ? "border-(--color-accent) bg-(--color-accent-lighter)" : "border-stone-200 bg-white hover:border-stone-300"
            }`}
          >
            <span className="text-2xl">{p.photoUrl ? "🐾" : "🐾"}</span>
            <div className="text-left">
              <p className="font-medium text-stone-800 text-sm">{p.name}</p>
              <p className="text-xs text-stone-500">{p.breed}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Profile Header */}
      {selectedPet && (
        <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-2xl bg-(--color-accent-light) flex items-center justify-center text-4xl overflow-hidden">
              {selectedPet.photoUrl ? (
                <img src={selectedPet.photoUrl} alt={selectedPet.name} className="w-full h-full object-cover" />
              ) : (
                <span>🐾</span>
              )}
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-semibold text-stone-800">{selectedPet.name}</h2>
              <p className="text-stone-500 text-sm">{selectedPet.breed} · {selectedPet.weight} lbs</p>
              <p className="text-stone-400 text-xs mt-0.5">
                Born {selectedPet.birthDate ? new Date(selectedPet.birthDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "Unknown"}
              </p>
            </div>
            {!readOnly && (
              <button onClick={() => setEditingPetId(selectedPet.id)} className="p-2 hover:bg-stone-50 rounded-lg">
                <Edit3 size={16} className="text-stone-400" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-white rounded-xl border border-stone-200 p-1 overflow-x-auto">
        {([
          { id: "info", label: "Basic Info", icon: PawPrint },
          { id: "medical", label: "Medical", icon: Heart },
          { id: "grooming", label: "Grooming", icon: Scissors },
          { id: "history", label: "History", icon: Clock },
        ] as const).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${
              activeTab === id ? "bg-(--color-accent-light) text-(--color-accent-dark)" : "text-stone-500 hover:text-stone-700"
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
        {activeTab === "info" && selectedPet && <BasicInfoTab pet={selectedPet} readOnly={readOnly} />}
        {activeTab === "medical" && selectedPet && <MedicalTab pet={selectedPet} readOnly={readOnly} />}
        {activeTab === "grooming" && selectedPet && <GroomingTab pet={selectedPet} readOnly={readOnly} />}
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
      <InfoRow label="Breed" value={pet.breed || "Unknown"} />
      <InfoRow label="Weight" value={`${pet.weight} lbs`} />
      <InfoRow label="Date of Birth" value={pet.birthDate ? new Date(pet.birthDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "Unknown"} />
      <InfoRow label="Notes" value={pet.notes || "None"} />
      {!readOnly && (
        <button className="mt-4 text-sm text-(--color-accent-dark) font-medium hover:underline">
          Upload Photo
        </button>
      )}
    </div>
  );
}

function MedicalTab({ pet, readOnly }: { pet: Pet; readOnly: boolean }) {
  return (
    <div>
      <InfoRow label="Notes" value={pet.notes || "No medical notes on file"} />
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
      <InfoRow label="Notes" value={pet.notes || "No grooming notes on file"} />
      {!readOnly && (
        <button className="mt-4 text-sm text-(--color-accent-dark) font-medium hover:underline">
          Upload Reference Photo
        </button>
      )}
    </div>
  );
}

function HistoryTab({ petHistory }: { petHistory: Appointment[] }) {
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
              <p className="text-sm font-medium text-stone-800">
                {appt.service ? "Grooming Service" : "Appointment"}
              </p>
              <p className="text-xs text-stone-500">
                with {appt.staff?.name || "Unknown Groomer"}
              </p>
            </div>
            <span className="text-xs text-stone-400">
              {new Date(appt.startTime).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </span>
            {appt.reportCardId && (
              <span className="text-xs text-(--color-accent-dark) font-medium">Report</span>
            )}
          </div>
        ))
      )}
    </div>
  );
}
