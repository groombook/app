import { useState } from "react";
import { User, Lock, PawPrint, FileCheck, Plus, Archive } from "lucide-react";
import { CUSTOMER, PETS, SIGNED_AGREEMENTS } from "../mockData.js";

interface Props {
  readOnly: boolean;
}

export function AccountSettings({ readOnly }: Props) {
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

      {tab === "personal" && <PersonalInfo readOnly={readOnly} />}
      {tab === "password" && <PasswordChange readOnly={readOnly} />}
      {tab === "pets" && <ManagePets readOnly={readOnly} />}
      {tab === "agreements" && <Agreements />}
    </div>
  );
}

function PersonalInfo({ readOnly }: { readOnly: boolean }) {
  const [form, setForm] = useState({
    name: CUSTOMER.name,
    email: CUSTOMER.email,
    phone: CUSTOMER.phone,
    address: CUSTOMER.address,
  });

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

function ManagePets({ readOnly }: { readOnly: boolean }) {
  return (
    <div className="space-y-4">
      {PETS.map(pet => (
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
              <button className="px-3 py-1.5 border border-stone-200 rounded-lg text-xs text-stone-600 hover:bg-stone-50">
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
        <button className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-stone-300 rounded-2xl text-sm text-stone-500 hover:border-(--color-accent) hover:text-(--color-accent-dark) transition-colors">
          <Plus size={16} />
          Add New Pet
        </button>
      )}
    </div>
  );
}

function Agreements() {
  return (
    <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-stone-400 border-b border-stone-100">
              <th className="px-5 py-3 font-medium">Document</th>
              <th className="px-5 py-3 font-medium">Date Signed</th>
              <th className="px-5 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {SIGNED_AGREEMENTS.map(agr => (
              <tr key={agr.id} className="border-b border-stone-50">
                <td className="px-5 py-3 font-medium text-stone-800">{agr.name}</td>
                <td className="px-5 py-3 text-stone-600">
                  {new Date(agr.dateSigned).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </td>
                <td className="px-5 py-3">
                  <button className="text-sm text-(--color-accent-dark) font-medium hover:underline">View</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
