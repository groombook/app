import { useState, useEffect } from "react";
import { Bell, Mail, Smartphone } from "lucide-react";
import { useConversation, useMessages } from "./Communication.api.js";
import type { Message as ApiMessage } from "./Communication.api.js";

interface NotificationCategory {
  email: boolean;
  sms: boolean;
  push: boolean;
}

interface NotificationPreferences {
  appointmentReminders: NotificationCategory;
  vaccinationAlerts: NotificationCategory;
  promotional: NotificationCategory;
  reportCards: NotificationCategory;
  invoiceReceipts: NotificationCategory;
}

interface Props {
  sessionId: string | null;
  readOnly: boolean;
}

export function Communication({ sessionId, readOnly }: Props) {
  const [tab, setTab] = useState<"messages" | "notifications">("messages");

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        <button
          onClick={() => setTab("messages")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium ${
            tab === "messages" ? "bg-(--color-accent-light) text-(--color-accent-dark)" : "text-stone-500 hover:bg-stone-50"
          }`}
        >
          Messages
        </button>
        <button
          onClick={() => setTab("notifications")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium ${
            tab === "notifications" ? "bg-(--color-accent-light) text-(--color-accent-dark)" : "text-stone-500 hover:bg-stone-50"
          }`}
        >
          <Bell size={14} />
          Notification Preferences
        </button>
      </div>

      {tab === "messages" && <MessageThread sessionId={sessionId} readOnly={readOnly} />}
      {tab === "notifications" && <NotificationPreferences readOnly={readOnly} />}
    </div>
  );
}

interface MessageThreadProps {
  sessionId: string | null;
  readOnly: boolean;
}

function MessageThread({ sessionId, readOnly }: MessageThreadProps) {
  const [businessName, setBusinessName] = useState<string>("Business");

  const { conversation, loading: convLoading, error: convError } = useConversation(sessionId);
  const { messages, loading: msgLoading, error: msgError, loadMore, hasMore } = useMessages(sessionId);

  useEffect(() => {
    async function fetchBranding() {
      try {
        const response = await fetch("/api/branding");
        if (response.ok) {
          const data = await response.json();
          setBusinessName(data.businessName || data.name || "Business");
        }
      } catch {
        setBusinessName("Business");
      }
    }
    fetchBranding();
  }, []);

  const loading = convLoading || msgLoading;
  const error = convError || msgError;

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden flex flex-col" style={{ height: "500px" }}>
        <div className="px-5 py-3 border-b border-stone-200 bg-stone-50 flex items-center justify-center">
          <div className="animate-pulse text-stone-400 text-sm">Loading messages...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden flex flex-col" style={{ height: "500px" }}>
        <div className="px-5 py-3 border-b border-stone-200 bg-stone-50">
          <p className="text-sm font-medium text-stone-800">{businessName}</p>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-red-500 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!conversation) {
    return (
      <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden flex flex-col" style={{ height: "500px" }}>
        <div className="px-5 py-3 border-b border-stone-200 bg-stone-50">
          <p className="text-sm font-medium text-stone-800">{businessName}</p>
          <p className="text-xs text-stone-400">Usually replies within a few hours</p>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8">
          <div className="w-12 h-12 rounded-full bg-stone-100 flex items-center justify-center">
            <Mail size={20} className="text-stone-400" />
          </div>
          <p className="text-stone-500 text-sm text-center">No conversation yet</p>
          <p className="text-stone-400 text-xs text-center">Messages with {businessName} will appear here once you start texting.</p>
        </div>
        <div className="border-t border-stone-200 p-3 flex gap-2">
          <div
            className="flex-1 border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-400 bg-stone-50 flex items-center justify-center gap-2"
            title="Reply from your phone"
          >
            Reply from your phone
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden flex flex-col" style={{ height: "500px" }}>
      <div className="px-5 py-3 border-b border-stone-200 bg-stone-50">
        <p className="text-sm font-medium text-stone-800">{businessName}</p>
        <p className="text-xs text-stone-400">Usually replies within a few hours</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <p className="text-stone-400 text-center text-sm italic">No messages yet</p>
        ) : (
          messages.map((msg: ApiMessage) => {
            const sender = msg.direction === "inbound" ? "customer" : "business";
            const senderName = sender === "customer" ? "You" : businessName;
            return (
              <div key={msg.id} className={`flex ${sender === "customer" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                  sender === "customer"
                    ? "bg-(--color-accent) text-white rounded-br-md"
                    : "bg-stone-100 text-stone-800 rounded-bl-md"
                }`}>
                  {msg.body && <p className="text-sm">{msg.body}</p>}
                  <div className={`flex items-center gap-1 mt-1 ${sender === "customer" ? "justify-end" : ""}`}>
                    <span className={`text-xs ${sender === "customer" ? "text-white/60" : "text-stone-400"}`}>
                      {new Date(msg.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
        {hasMore && (
          <div className="flex justify-center">
            <button
              onClick={loadMore}
              className="text-sm text-(--color-accent) hover:underline"
            >
              Load more
            </button>
          </div>
        )}
      </div>

      <div className="border-t border-stone-200 p-3 flex gap-2">
        <div
          className="flex-1 border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-400 bg-stone-50 flex items-center justify-center gap-2"
          title="Reply from your phone"
        >
          Reply from your phone
        </div>
      </div>
    </div>
  );
}

function NotificationPreferences({ readOnly }: { readOnly: boolean }) {
  const [prefs, setPrefs] = useState<NotificationPreferences>({
    appointmentReminders: { email: true, sms: true, push: true },
    vaccinationAlerts: { email: true, sms: false, push: true },
    promotional: { email: false, sms: false, push: false },
    reportCards: { email: true, sms: false, push: true },
    invoiceReceipts: { email: true, sms: false, push: false },
  });

  type PrefKey = keyof NotificationPreferences;
  type ChannelKey = "email" | "sms" | "push";

  const toggle = (category: PrefKey, channel: ChannelKey) => {
    if (readOnly) return;
    setPrefs(prev => ({
      ...prev,
      [category]: {
        ...prev[category],
        [channel]: !prev[category][channel],
      },
    }));
  };

  const categories: { key: PrefKey; label: string; desc: string; icon: typeof Bell }[] = [
    { key: "appointmentReminders", label: "Appointment Reminders", desc: "Upcoming appointment notifications", icon: Bell },
    { key: "vaccinationAlerts", label: "Vaccination Alerts", desc: "Expiration and renewal reminders", icon: Mail },
    { key: "promotional", label: "Promotions & Offers", desc: "Deals and seasonal specials", icon: Smartphone },
    { key: "reportCards", label: "Report Cards", desc: "Grooming report card delivery", icon: Mail },
    { key: "invoiceReceipts", label: "Invoice & Receipts", desc: "Payment confirmations", icon: Bell },
  ];

  const channels: { key: ChannelKey; label: string; icon: typeof Mail }[] = [
    { key: "email", label: "Email", icon: Mail },
    { key: "sms", label: "SMS", icon: Smartphone },
    { key: "push", label: "Push", icon: Bell },
  ];

  return (
    <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-100">
              <th className="text-left px-5 py-3 text-xs text-stone-400 font-medium">Category</th>
              {channels.map(ch => (
                <th key={ch.key} className="px-5 py-3 text-xs text-stone-400 font-medium text-center">
                  <div className="flex items-center justify-center gap-1">
                    <ch.icon size={12} />
                    {ch.label}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {categories.map(cat => (
              <tr key={cat.key} className="border-b border-stone-50">
                <td className="px-5 py-3">
                  <p className="font-medium text-stone-800">{cat.label}</p>
                  <p className="text-xs text-stone-400">{cat.desc}</p>
                </td>
                {channels.map(ch => (
                  <td key={ch.key} className="px-5 py-3 text-center">
                    <button
                      onClick={() => toggle(cat.key, ch.key)}
                      disabled={readOnly}
                      className={`w-10 h-5 rounded-full transition-colors inline-block ${
                        prefs[cat.key][ch.key] ? "bg-(--color-accent)" : "bg-stone-300"
                      } ${readOnly ? "cursor-not-allowed opacity-60" : ""}`}
                    >
                      <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${
                        prefs[cat.key][ch.key] ? "translate-x-5" : "translate-x-0.5"
                      }`} />
                    </button>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Communication;