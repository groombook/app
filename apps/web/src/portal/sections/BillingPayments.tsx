import { useState, useEffect } from "react";

interface Invoice {
  id: string;
  status: "pending" | "paid" | "failed" | "refunded";
  totalCents: number;
  date: string;
  description?: string;
}

interface PaymentMethod {
  brand: string;
  last4: string;
  expiryMonth: number;
  expiryYear: number;
}

interface Package {
  name: string;
  remaining: number;
}

interface BillingPaymentsProps {
  sessionId: string | null;
  readOnly: boolean;
}

export function BillingPayments({ sessionId, readOnly }: BillingPaymentsProps) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      if (!sessionId) {
        setLoading(false);
        return;
      }

      try {
        const response = await fetch("/api/portal/invoices", {
          headers: {
            "x-session-id": sessionId,
          },
        });

        if (!response.ok) {
          throw new Error("Failed to fetch invoices");
        }

        const data = await response.json();
        setInvoices(data.invoices || []);
        setPaymentMethods(data.paymentMethods || []);
        setPackages(data.packages || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [sessionId]);

  const formatCents = (cents: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(cents / 100);
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-1/3"></div>
          <div className="h-24 bg-gray-200 rounded"></div>
          <div className="h-24 bg-gray-200 rounded"></div>
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
    <div className="p-6 space-y-8">
      <h2 className="text-2xl font-semibold">Billing & Payments</h2>

      {/* Payment Methods */}
      <section>
        <h3 className="text-lg font-medium mb-4">Payment Methods</h3>
        {paymentMethods.length === 0 ? (
          <p className="text-gray-500 italic">No payment methods on file</p>
        ) : (
          <div className="space-y-3">
            {paymentMethods.map((method) => (
              <div
                key={`${method.brand}-${method.last4}`}
                className="flex items-center justify-between p-4 border rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-6 bg-gray-200 rounded flex items-center justify-center text-xs">
                    {method.brand.toUpperCase()}
                  </div>
                  <span>**** {method.last4}</span>
                  <span className="text-gray-500">
                    {method.expiryMonth}/{method.expiryYear}
                  </span>
                </div>
                {!readOnly && (
                  <button className="text-sm text-blue-600 hover:underline">
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Packages */}
      <section>
        <h3 className="text-lg font-medium mb-4">Packages</h3>
        {packages.length === 0 ? (
          <p className="text-gray-500 italic">No packages purchased</p>
        ) : (
          <div className="space-y-3">
            {packages.map((pkg, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-4 border rounded-lg"
              >
                <span>{pkg.name}</span>
                <span className="text-gray-600">{pkg.remaining} remaining</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Invoices */}
      <section>
        <h3 className="text-lg font-medium mb-4">Invoice History</h3>
        {invoices.length === 0 ? (
          <p className="text-gray-500 italic">No invoices yet</p>
        ) : (
          <div className="space-y-3">
            {invoices.map((invoice) => (
              <div
                key={invoice.id}
                className="flex items-center justify-between p-4 border rounded-lg"
              >
                <div className="flex flex-col">
                  <span className="font-medium">
                    {invoice.description || `Invoice ${invoice.id.slice(0, 8)}`}
                  </span>
                  <span className="text-sm text-gray-500">{invoice.date}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-semibold">
                    {formatCents(invoice.totalCents)}
                  </span>
                  <span
                    className={`px-2 py-1 text-xs rounded ${
                      invoice.status === "pending"
                        ? "bg-yellow-100 text-yellow-800"
                        : "bg-green-100 text-green-800"
                    }`}
                  >
                    {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default BillingPayments;