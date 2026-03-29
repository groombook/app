import React, { useState, useEffect } from "react";
import { User, Lock, PawPrint, FileCheck, Plus, Archive } from "lucide-react";
import { PetForm } from "./PetForm.js";

interface Props {
  sessionId: string | null;
  readOnly: boolean;
}

interface PersonalInfoData {
  id?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  address?: string;
}

interface PetData {
  id: string;
  name: string;
  species?: string;
  breed?: string;
  weight?: number;
  photo?: string;
}

export function AccountSettings({ sessionId, readOnly }: Props) {
  const [tab, setTab] = useState<"personal" | "password" | "pets" | "agreements">("personal");

  return (
    <div className="space-y-6">
      <div className="flex gap-1 flex-wrap">
        {([
          { id: "personal" as const, label: "Personal Info", icon: User },
          { id: "password" as const, label: "Password", icon: Lock },
          { id: "pets" as const, label: "Manage Pets", icon: PawPrint },
          { id: "agreements" as const, label: "Agreements", icon: FileCheck },
        ]).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium ${
              tab === id ? "bg-(--color-accent-light) text-(--color-accent-dark)" : "text-stone-500 hover:bg-stone-50"
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {tab === "personal" && <PersonalInfo sessionId={sessionId} readOnly={readOnly} />}
      {tab === "password" && <PasswordChange readOnly={readOnly} />}
      {tab === "pets" && <ManagePets sessionId={sessionId} readOnly={readOnly} />}
      {tab === "agreements" && <Agreements />}
    </div>
  );
}

function PersonalInfo({ sessionId, readOnly }: { sessionId: string | null; readOnly: boolean }) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPersonalInfo = async () => {
      try {
        setLoading(true);
        const response = await fetch("/api/portal/me");
        if (response.ok) {
          const data: PersonalInfoData = await response.json();
          setForm({
            name: [data.firstName, data.lastName].filter(Boolean).join(" ") || "",
            email: data.email || "",
            phone: data.phone || "",
            address: data.address || "",
          });
        } else {
          setError("Failed to load personal info");
        }
      } catch {
        setError("Failed to load personal info");
      } finally {
        setLoading(false);
      }
    };

    fetchPersonalInfo();
  }, [sessionId]);

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
        <p className="text-sm text-stone-500">Loading personal info...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
        <p className="text-sm text-red-500">{error}</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
      <h3 className="font-medium text-stone-800 mb-4">Personal Information</h3>
      <div className="space-y-4 max-w-md">
        {([
          { key: "name" as const, label: "Full Name", type: "text" },
          { key: "email" as const, label: "Email", type: "email" },
          { key: "phone" as const, label: "Phone", type: "tel" },
          { key: "address" as const, label: "Address", type: "text" },
        ]).map(({ key, label, type }) => (
          <div key={key}>
            <label className="block text-sm font-medium text-stone-700 mb-1">{label}</label>
            <input
              type={type}
              value={form[key]}
              onChange={e => !readOnly && setForm({ ...form, [key]: e.target.value })}
              disabled={readOnly}
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm disabled:bg-stone-50 disabled:text-stone-500"
            />
          </div>
        ))}
        {!readOnly && (
          <button className="px-4 py-2 bg-(--color-accent) text-white rounded-lg text-sm font-medium hover:bg-(--color-accent-hover)">
            Save Changes
          </button>
        )}
      </div>
    </div>
  );
}

function PasswordChange({ readOnly }: { readOnly: boolean }) {
  if (readOnly) {
    return (
      <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
        <p className="text-sm text-stone-500">Password changes are not available during staff impersonation.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
      <h3 className="font-medium text-stone-800 mb-4">Change Password</h3>
      <div className="space-y-4 max-w-md">
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">Current Password</label>
          <input type="password" className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">New Password</label>
          <input type="password" className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">Confirm New Password</label>
          <input type="password" className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <button className="px-4 py-2 bg-(--color-accent) text-white rounded-lg text-sm font-medium hover:bg-(--color-accent-hover)">
          Update Password
        </button>
      </div>
    </div>
  );
}

function ManagePets({ sessionId, readOnly }: { sessionId: string | null; readOnly: boolean }) {
  const [pets, setPets] = useState<PetData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingPetId, setEditingPetId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  useEffect(() => {
    const fetchPets = async () => {
      try {
        setLoading(true);
        const response = await fetch("/api/portal/pets");
        if (response.ok) {
          const data = await response.json();
          setPets(Array.isArray(data) ? data : []);
        } else {
          setError("Failed to load pets");
        }
      } catch {
        setError("Failed to load pets");
      } finally {
        setLoading(false);
      }
    };

    fetchPets();
  }, [sessionId]);

  const editingPet = editingPetId ? pets.find(p => p.id === editingPetId) ?? undefined : undefined;

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
        <p className="text-sm text-stone-500">Loading pets...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
        <p className="text-sm text-red-500">{error}</p>
      </div>
    );
  }

  if (editingPet || showAddForm) {
    return (
      <PetForm
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        pet={(editingPet ?? undefined) as any}
        onSave={() => { setEditingPetId(null); setShowAddForm(false); }}
        onCancel={() => { setEditingPetId(null); setShowAddForm(false); }}
      />
    );
  }

  return (
    <div className="space-y-4">
      {pets.map(pet => (
        <div key={pet.id} className="bg-white rounded-2xl border border-stone-200 p-4 shadow-sm flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl bg-(--color-accent-light) flex items-center justify-center text-3xl">
            {pet.photo}
          </div>
          <div className="flex-1">
            <p className="font-medium text-stone-800">{pet.name}</p>
            <p className="text-sm text-stone-500">{pet.breed} · {pet.weight} lbs</p>
          </div>
          {!readOnly && (
            <div className="flex gap-2">
              <button
                onClick={() => setEditingPetId(pet.id)}
                className="px-3 py-1.5 border border-stone-200 rounded-lg text-xs text-stone-600 hover:bg-stone-50"
              >
                Edit
              </button>
              <button className="p-1.5 border border-stone-200 rounded-lg text-stone-400 hover:text-amber-600 hover:border-amber-200">
                <Archive size={14} />
              </button>
            </div>
          )}
        </div>
      ))}
      {!readOnly && (
        <button
          onClick={() => setShowAddForm(true)}
          className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-stone-300 rounded-2xl text-sm text-stone-500 hover:border-(--color-accent) hover:text-(--color-accent-dark) transition-colors"
        >
          <Plus size={16} />
          Add New Pet
        </button>
      )}
    </div>
  );
}

function Agreements() {
  return (
    <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
      <p className="text-sm text-stone-500">
        No agreements found. There is currently no agreements table in the database.
      </p>
    </div>
  );
}
