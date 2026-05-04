import { useState, useEffect, useRef } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { CreditCard, DollarSign, Package, Zap } from "lucide-react";

interface Invoice {
  id: string;
  status: "pending" | "paid" | "failed" | "refunded";
  totalCents: number;
  date: string;
  description?: string;
}

interface PaymentMethod {
  id: string;
  brand: string;
  last4: string;
  expiryMonth: number;
  expiryYear: number;
}

interface BillingPaymentsProps {
  sessionId: string | null;
  readOnly: boolean;
}

function BillingPaymentsInner({ sessionId, readOnly }: BillingPaymentsProps) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [packages] = useState<{ name: string; remaining: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"invoices" | "payment" | "packages">("invoices");
  const [autopay, setAutopay] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [publishableKey, setPublishableKey] = useState<string>("");

  useEffect(() => {
    async function fetchData() {
      if (!sessionId) {
        setLoading(false);
        return;
      }

      try {
        const [configRes, invoicesRes, methodsRes] = await Promise.all([
          fetch("/api/portal/config", {
            headers: { "X-Impersonation-Session-Id": sessionId },
          }),
          fetch("/api/portal/invoices", {
            headers: { "X-Impersonation-Session-Id": sessionId },
          }),
          fetch("/api/portal/payment-methods", {
            headers: { "X-Impersonation-Session-Id": sessionId },
          }),
        ]);

        if (!configRes.ok) throw new Error("Failed to fetch config");
        const configData = await configRes.json();
        setPublishableKey(configData.stripePublishableKey ?? "");

        const invoicesData = await invoicesRes.json();
        setInvoices(Array.isArray(invoicesData) ? invoicesData : invoicesData.invoices || []);

        if (methodsRes.ok) {
          const methodsData = await methodsRes.json();
          setPaymentMethods(
            (methodsData ?? []).map((m: { id: string; card: { brand: string; last4: string; exp_month: number; exp_year: number } }) => ({
              id: m.id,
              brand: m.card?.brand ?? "unknown",
              last4: m.card?.last4 ?? "****",
              expiryMonth: m.card?.exp_month ?? 0,
              expiryYear: m.card?.exp_year ?? 0,
            }))
          );
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [sessionId]);

  const formatCents = (cents: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

  const pending = invoices.filter((i) => i.status === "pending");
  const totalPending = pending.reduce((sum, i) => sum + i.totalCents, 0);

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-1/3" />
          <div className="h-24 bg-gray-200 rounded" />
          <div className="h-24 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="text-red-600">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {totalPending > 0 && (
        <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <p className="text-sm text-stone-500">Outstanding Balance</p>
            <p className="text-3xl font-bold text-stone-800">{formatCents(totalPending)}</p>
            <p className="text-xs text-stone-400 mt-0.5">
              {pending.length} unpaid invoice{pending.length > 1 ? "s" : ""}
            </p>
          </div>
          <button
            onClick={() => setShowPaymentModal(true)}
            className="px-6 py-2 bg-(--color-accent) text-white rounded-lg text-sm font-medium hover:bg-(--color-accent-hover)"
          >
            Pay Now
          </button>
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto scrollbar-hide">
        {([
          { id: "invoices" as const, label: "Invoices", icon: DollarSign },
          { id: "payment" as const, label: "Payment Methods", icon: CreditCard },
          { id: "packages" as const, label: "Packages", icon: Package },
        ]).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium ${
              tab === id
                ? "bg-(--color-accent-light) text-(--color-accent-dark)"
                : "text-stone-500 hover:bg-stone-50"
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {tab === "invoices" && (
        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-stone-400 border-b border-stone-100">
                  <th className="px-5 py-3 font-medium">Date</th>
                  <th className="px-5 py-3 font-medium">Description</th>
                  <th className="px-5 py-3 font-medium">Amount</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium" />
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} className="border-b border-stone-50 hover:bg-stone-50/50">
                    <td className="px-5 py-3 text-stone-700">
                      {new Date(inv.date).toLocaleDateString("en-US", {
                        month: "short", day: "numeric", year: "numeric",
                      })}
                    </td>
                    <td className="px-5 py-3 text-stone-600">
                      {inv.description || `Invoice ${inv.id.slice(0, 8)}`}
                    </td>
                    <td className="px-5 py-3 font-medium text-stone-800">
                      {formatCents(inv.totalCents)}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          inv.status === "paid"
                            ? "bg-green-100 text-green-700"
                            : inv.status === "pending"
                            ? "bg-yellow-100 text-yellow-700"
                            : inv.status === "failed"
                            ? "bg-red-100 text-red-700"
                            : "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <button className="text-stone-400 hover:text-stone-600">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "payment" && (
        <div className="space-y-4">
          {paymentMethods.length === 0 ? (
            <p className="text-gray-500 italic">No payment methods on file</p>
          ) : (
            <div className="space-y-3">
              {paymentMethods.map((method) => (
                <div
                  key={method.id}
                  className="flex items-center justify-between p-4 border border-stone-200 rounded-lg bg-white"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-6 bg-gray-200 rounded flex items-center justify-center text-xs">
                      {method.brand.toUpperCase()}
                    </div>
                    <span className="text-stone-700">**** {method.last4}</span>
                    <span className="text-stone-500">
                      {method.expiryMonth}/{method.expiryYear}
                    </span>
                  </div>
                  {!readOnly && (
                    <button
                      onClick={async () => {
                        const res = await fetch(`/api/portal/payment-methods/${method.id}`, {
                          method: "DELETE",
                          headers: { "X-Impersonation-Session-Id": sessionId ?? "" },
                        });
                        if (res.ok) {
                          setPaymentMethods((prev) => prev.filter((m) => m.id !== method.id));
                        }
                      }}
                      className="text-sm text-blue-600 hover:underline"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-(--color-accent-light) flex items-center justify-center">
                  <Zap size={18} className="text-(--color-accent)" />
                </div>
                <div>
                  <p className="text-sm font-medium text-stone-800">Autopay</p>
                  <p className="text-xs text-stone-500">Automatically charge after each appointment</p>
                </div>
              </div>
              {!readOnly ? (
                <button
                  onClick={() => setAutopay(!autopay)}
                  className={`w-12 h-6 rounded-full transition-colors ${
                    autopay ? "bg-(--color-accent)" : "bg-stone-300"
                  }`}
                >
                  <div
                    className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${
                      autopay ? "translate-x-6" : "translate-x-0.5"
                    }`}
                  />
                </button>
              ) : (
                <span className="text-xs text-stone-400">
                  {autopay ? "Enabled" : "Disabled"}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === "packages" && (
        <div className="space-y-4">
          {packages.length === 0 ? (
            <p className="text-gray-500 italic">No packages purchased</p>
          ) : (
            packages.map((pkg, index) => (
              <div key={index} className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-stone-800">{pkg.name}</span>
                  <span className="text-stone-600">{pkg.remaining} remaining</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {showPaymentModal && publishableKey && (
        <PaymentModalWrapper
          key={Date.now()}
          sessionId={sessionId ?? ""}
          publishableKey={publishableKey}
          pending={pending}
          onClose={() => setShowPaymentModal(false)}
          onSuccess={() => {
            setInvoices((prev) =>
              prev.map((inv) =>
                pending.some((p) => p.id === inv.id) ? { ...inv, status: "paid" as const } : inv
              )
            );
            setShowPaymentModal(false);
          }}
        />
      )}
    </div>
  );
}

interface PaymentModalWrapperProps {
  sessionId: string;
  publishableKey: string;
  pending: Invoice[];
  onClose: () => void;
  onSuccess: () => void;
}

function PaymentModalWrapper({ sessionId, publishableKey, pending, onClose, onSuccess }: PaymentModalWrapperProps) {
  const [stripePromise] = useState(() =>
    publishableKey ? loadStripe(publishableKey) : Promise.resolve(null)
  );

  return (
    <Elements stripe={stripePromise} options={{ mode: "payment", amount: pending.reduce((s, i) => s + i.totalCents, 0), currency: "usd" }}>
      <PaymentModal sessionId={sessionId} pending={pending} onClose={onClose} onSuccess={onSuccess} />
    </Elements>
  );
}

interface PaymentModalProps {
  sessionId: string;
  pending: Invoice[];
  onClose: () => void;
  onSuccess: () => void;
}

function PaymentModal({ sessionId, pending, onClose, onSuccess }: PaymentModalProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [selectedInvoices, setSelectedInvoices] = useState<Set<string>>(new Set(pending.map((i) => i.id)));
  const [saveCard, setSaveCard] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const completeModalRef = useRef<HTMLDivElement>(null);
  const paymentModalRef = useRef<HTMLDivElement>(null);

  // Focus trap + Escape-to-close for both inline modals
  useEffect(() => {
    const modalRef = isComplete ? completeModalRef.current : paymentModalRef.current;
    if (!modalRef) return;

    const previouslyFocused = document.activeElement as HTMLElement;
    const focusableSelectors = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const focusableElements = modalRef.querySelectorAll<HTMLElement>(focusableSelectors);
    const firstFocusable = focusableElements[0];
    firstFocusable?.focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !modalRef) return;
      const focusables = modalRef.querySelectorAll<HTMLElement>(focusableSelectors);
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [isComplete, onClose]);

  const formatCents = (cents: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

  const toggleInvoice = (id: string) => {
    const next = new Set(selectedInvoices);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedInvoices(next);
  };

  const selectedTotal = pending.filter((i) => selectedInvoices.has(i.id)).reduce((sum, i) => sum + i.totalCents, 0);

  const handlePay = async () => {
    if (!stripe || !elements) return;
    setIsProcessing(true);
    setError(null);

    try {
      const isMulti = selectedInvoices.size > 1;
      const endpoint = isMulti ? "/api/portal/invoices/pay-multiple" : `/api/portal/invoices/${[...selectedInvoices][0]}/pay`;
      const body = isMulti ? { invoiceIds: [...selectedInvoices] } : {};

      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Impersonation-Session-Id": sessionId,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to initialize payment");
      }

      const { clientSecret } = await res.json();

      const { error: stripeError } = await stripe.confirmPayment({
        elements,
        clientSecret,
        confirmParams: saveCard
          ? { setup_future_usage: "off_session" }
          : undefined,
        redirect: "if_required",
      });

      if (stripeError) {
        setError(stripeError.message ?? "Payment failed");
        setIsProcessing(false);
        return;
      }

      setIsComplete(true);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
      setIsProcessing(false);
    }
  };

  if (isComplete) {
    return (
      <div role="dialog" aria-modal="true" className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div ref={completeModalRef} className="bg-white rounded-2xl shadow-xl max-w-md w-full p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="font-semibold text-stone-800 text-lg mb-2">Payment Successful</h2>
          <p className="text-stone-500 text-sm mb-6">
            Your payment of {formatCents(selectedTotal)} has been processed. A receipt has been sent to your email.
          </p>
          <button onClick={onClose} className="w-full px-4 py-2 bg-(--color-accent) text-white rounded-lg text-sm font-medium">
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div ref={paymentModalRef} className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-semibold text-stone-800 text-lg">Pay Outstanding Balance</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <p className="text-sm text-stone-500 mb-4">Select invoices to pay:</p>

        <div className="space-y-3 mb-6">
          {pending.map((inv) => (
            <label
              key={inv.id}
              className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                selectedInvoices.has(inv.id)
                  ? "border-(--color-accent) bg-(--color-accent-lighter)"
                  : "border-stone-200 hover:border-stone-300"
              }`}
            >
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={selectedInvoices.has(inv.id)}
                  onChange={() => toggleInvoice(inv.id)}
                  className="w-4 h-4 rounded border-stone-300 text-(--color-accent) focus:ring-(--color-accent)"
                />
                <div>
                  <p className="text-sm font-medium text-stone-800">
                    {inv.description || `Invoice ${inv.id.slice(0, 8)}`}
                  </p>
                  <p className="text-xs text-stone-500">
                    {new Date(inv.date).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <span className="text-sm font-medium text-stone-800">{formatCents(inv.totalCents)}</span>
            </label>
          ))}
        </div>

        <div className="border-t border-stone-200 pt-4 mb-6">
          <div className="flex justify-between items-center mb-4">
            <span className="text-sm text-stone-600">Total</span>
            <span className="text-lg font-bold text-stone-800">{formatCents(selectedTotal)}</span>
          </div>

          <PaymentElement />
        </div>

        <label className="flex items-center gap-2 mb-4">
          <input
            type="checkbox"
            checked={saveCard}
            onChange={(e) => setSaveCard(e.target.checked)}
            className="w-4 h-4 rounded border-stone-300 text-(--color-accent) focus:ring-(--color-accent)"
          />
          <span className="text-sm text-stone-600">Save card for future payments</span>
        </label>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-stone-200 rounded-lg text-sm font-medium text-stone-600 hover:bg-stone-50"
          >
            Cancel
          </button>
          <button
            onClick={handlePay}
            disabled={selectedInvoices.size === 0 || isProcessing || !stripe}
            className="flex-1 px-4 py-2 bg-(--color-accent) text-white rounded-lg text-sm font-medium hover:bg-(--color-accent-hover) disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isProcessing ? "Processing..." : "Pay Now"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function BillingPayments(props: BillingPaymentsProps) {
  return <BillingPaymentsInner {...props} />;
}

export default BillingPayments;