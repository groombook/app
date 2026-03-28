import { useState } from "react";
import { X, Save } from "lucide-react";
import type { Pet } from "../mockData.js";

interface Props {
  pet?: Pet;
  onSave: (pet: Pet) => void;
  onCancel: () => void;
}

export function PetForm({ pet, onSave, onCancel }: Props) {
  const [name, setName] = useState(pet?.name ?? "");
  const [breed, setBreed] = useState(pet?.breed ?? "");
  const [weight, setWeight] = useState(pet?.weight ?? 0);
  const [notes, setNotes] = useState(pet?.allergies ?? "");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!pet) return;
    onSave({ ...pet, name, breed, weight, allergies: notes });
  }

  return (
    <div className="bg-white rounded-2xl border border-stone-200 p-6 shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-stone-800">{pet ? "Edit Pet" : "Add Pet"}</h2>
        <button onClick={onCancel} className="p-2 hover:bg-stone-50 rounded-lg">
          <X size={16} className="text-stone-400" />
        </button>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-stone-600 mb-1">Name</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-(--color-accent)"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-600 mb-1">Breed</label>
          <input
            type="text"
            value={breed}
            onChange={e => setBreed(e.target.value)}
            className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-(--color-accent)"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-600 mb-1">Weight (lbs)</label>
          <input
            type="number"
            value={weight}
            onChange={e => setWeight(Number(e.target.value))}
            className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-(--color-accent)"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-600 mb-1">Notes</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-(--color-accent)"
          />
        </div>
        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 px-4 py-2 border border-stone-200 rounded-lg text-sm text-stone-600 hover:bg-stone-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 bg-(--color-accent) text-white rounded-lg text-sm font-medium hover:bg-(--color-accent-hover)"
          >
            <Save size={14} />
            Save
          </button>
        </div>
      </form>
    </div>
  );
}
