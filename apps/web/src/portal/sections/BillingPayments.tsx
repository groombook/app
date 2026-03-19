import { useState } from "react";
import { CreditCard, Download, DollarSign, Package, Zap, Plus, Trash2 } from "lucide-react";
import { INVOICES, SAVED_PAYMENT_METHODS, PREPAID_PACKAGES } from "../mockData.js";

interface Props {
  readOnly: boolean;
}

const STATUS_STYLES: Record<string, string> = {
  paid: "bg-green-100 text-green-700",
  outstanding: "bg-amber-100 text-amber-700",
  overdue: "bg-red-100 text-red-700",
};

export function BillingPayments({ readOnly }: Props) {
  const [tab, setTab] = useState<"invoices" | "payment" | "packages">("invoices");
  const [autopay, setAutopay] = useState(false);
  const [showTipModal, setShowTipModal] = useState(false);

  const outstanding = INVOICES.filter(i => i.status === "outstanding");
  const totalOutstanding = outstanding.reduce((sum, i) => sum + i.amount, 0);

  return (
    <div className="space-y-6">
      {/* Outstanding Balance Banner */}
      {totalOutstanding > 0 && (
        <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <p className="text-sm text-stone-500">Outstanding Balance</p>
            <p className="text-3xl font-bold text-stone-800">${totalOutstanding.toFixed(2)}</p>
            <p className="text-xs text-stone-400 mt-0.5">{outstanding.length} unpaid invoice{outstanding.length > 1 ? "s" : ""}</p>
          </div>
          {!readOnly && (
            <div className="flex gap-2">
              <button
                onClick={() => setShowTipModal(true)}
                className="px-4 py-2 border border-stone-200 rounded-lg text-sm font-medium text-stone-600 hover:bg-stone-50"
              >
                Add Tip
              </button>
              <button className="px-6 py-2 bg-[#8b7355] text-white rounded-lg text-sm font-medium hover:bg-[#7a6549]">
                Pay Now
              </button>
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2">
        {([
          { id: "invoices" as const, label: "Invoices", icon: DollarSign },
          { id: "payment" as const, label: "Payment Methods", icon: CreditCard },
          { id: "packages" as const, label: "Packages", icon: Package },
        ]).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium ${
              tab === id ? "bg-[#f0ebe4] text-[#6b5a42]" : "text-stone-500 hover:bg-stone-50"
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* Invoices */}
      {tab === "invoices" && (
        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-stone-400 border-b border-stone-100">
                  <th className="px-5 py-3 font-medium">Date</th>
                  <th className="px-5 py-3 font-medium">Items</th>
                  <th className="px-5 py-3 font-medium">Amount</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {INVOICES.map(inv => (
                  <tr key={inv.id} className="border-b border-stone-50 hover:bg-stone-50/50">
                    <td className="px-5 py-3 text-stone-700">
                      {new Date(inv.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </td>
                    <td className="px-5 py-3 text-stone-600">{inv.items.join(", ")}</td>
                    <td className="px-5 py-3 font-medium text-stone-800">${inv.amount.toFixed(2)}</td>
                    <td className="px-5 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[inv.status]}`}>
                        {inv.status}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <button className="text-stone-400 hover:text-stone-600">
                        <Download size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Payment Methods */}
      {tab === "payment" && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm space-y-3">
            {SAVED_PAYMENT_METHODS.map(pm => (
              <div key={pm.id} className="flex items-center justify-between py-2 border-b border-stone-50 last:border-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-stone-100 flex items-center justify-center">
                    <CreditCard size={18} className="text-stone-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-stone-800 capitalize">{pm.type} •••• {pm.last4}</p>
                    <p className="text-xs text-stone-400">Expires {pm.expiry}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {pm.isDefault && (
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Default</span>
                  )}
                  {!readOnly && (
                    <button className="p-1 text-stone-400 hover:text-red-500">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
            {!readOnly && (
              <button className="flex items-center gap-2 text-sm text-[#6b5a42] font-medium hover:underline mt-2">
                <Plus size={14} />
                Add Payment Method
              </button>
            )}
          </div>

          {/* Autopay */}
          <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#f0ebe4] flex items-center justify-center">
                  <Zap size={18} className="text-[#8b7355]" />
                </div>
                <div>
                  <p className="text-sm font-medium text-stone-800">Autopay</p>
                  <p className="text-xs text-stone-500">Automatically charge after each appointment</p>
                </div>
              </div>
              {!readOnly ? (
                <button
                  onClick={() => setAutopay(!autopay)}
                  className={`w-12 h-6 rounded-full transition-colors ${autopay ? "bg-[#8b7355]" : "bg-stone-300"}`}
                >
                  <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${autopay ? "translate-x-6" : "translate-x-0.5"}`} />
                </button>
              ) : (
                <span className="text-xs text-stone-400">{autopay ? "Enabled" : "Disabled"}</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Packages */}
      {tab === "packages" && (
        <div className="space-y-4">
          {PREPAID_PACKAGES.map(pkg => (
            <div key={pkg.id} className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <Package size={20} className="text-[#8b7355]" />
                <h3 className="font-medium text-stone-800">{pkg.name}</h3>
              </div>
              <div className="flex items-center gap-4 mb-3">
                <div>
                  <p className="text-2xl font-bold text-stone-800">{pkg.totalCredits - pkg.usedCredits}</p>
                  <p className="text-xs text-stone-500">remaining of {pkg.totalCredits}</p>
                </div>
                <div className="flex-1 bg-stone-100 rounded-full h-3 overflow-hidden">
                  <div
                    className="bg-[#8b7355] h-full rounded-full"
                    style={{ width: `${((pkg.totalCredits - pkg.usedCredits) / pkg.totalCredits) * 100}%` }}
                  />
                </div>
              </div>
              <p className="text-xs text-stone-400">Expires {new Date(pkg.expiresAt).toLocaleDateString()}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tip Modal */}
      {showTipModal && !readOnly && (
        <TipModal onClose={() => setShowTipModal(false)} />
      )}
    </div>
  );
}

function TipModal({ onClose }: { onClose: () => void }) {
  const [tipPercent, setTipPercent] = useState<number | null>(20);
  const [customTip, setCustomTip] = useState("");
  const presets = [15, 20, 25];

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
        <h2 className="font-semibold text-stone-800 mb-4">Add a Tip</h2>
        <div className="flex gap-2 mb-4">
          {presets.map(pct => (
            <button
              key={pct}
              onClick={() => { setTipPercent(pct); setCustomTip(""); }}
              className={`flex-1 py-2 rounded-lg text-sm font-medium border ${
                tipPercent === pct ? "border-[#8b7355] bg-[#faf5ef] text-[#6b5a42]" : "border-stone-200 text-stone-600"
              }`}
            >
              {pct}%
            </button>
          ))}
          <button
            onClick={() => { setTipPercent(null); }}
            className={`flex-1 py-2 rounded-lg text-sm font-medium border ${
              tipPercent === null ? "border-[#8b7355] bg-[#faf5ef] text-[#6b5a42]" : "border-stone-200 text-stone-600"
            }`}
          >
            Custom
          </button>
        </div>
        {tipPercent === null && (
          <input
            type="number"
            placeholder="Enter amount"
            value={customTip}
            onChange={e => setCustomTip(e.target.value)}
            className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm mb-4"
          />
        )}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 px-4 py-2 border border-stone-200 rounded-lg text-sm">Cancel</button>
          <button onClick={onClose} className="flex-1 px-4 py-2 bg-[#8b7355] text-white rounded-lg text-sm font-medium">Add Tip</button>
        </div>
      </div>
    </div>
  );
}
