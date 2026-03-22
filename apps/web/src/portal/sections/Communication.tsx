import { useState } from "react";
import { Send, Check, CheckCheck, Bell, Mail, Smartphone, Megaphone, FileText, CreditCard } from "lucide-react";
import { MESSAGES, BUSINESS_NAME } from "../mockData.js";
import type { Message } from "../mockData.js";

interface Props {
  readOnly: boolean;
}

export function Communication({ readOnly }: Props) {
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

      {tab === "messages" && <MessageThread readOnly={readOnly} />}
      {tab === "notifications" && <NotificationPreferences readOnly={readOnly} />}
    </div>
  );
}

function MessageThread({ readOnly }: { readOnly: boolean }) {
  const [messages, setMessages] = useState<Message[]>(MESSAGES);
  const [newMessage, setNewMessage] = useState("");

  const handleSend = () => {
    if (!newMessage.trim() || readOnly) return;
    const msg: Message = {
      id: `m-${Date.now()}`,
      sender: "customer",
      senderName: "Sarah",
      text: newMessage.trim(),
      timestamp: new Date().toISOString(),
      read: false,
    };
    setMessages([...messages, msg]);
    setNewMessage("");
  };

  return (
    <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden flex flex-col" style={{ height: "500px" }}>
      <div className="px-5 py-3 border-b border-stone-200 bg-stone-50">
        <p className="text-sm font-medium text-stone-800">{BUSINESS_NAME}</p>
        <p className="text-xs text-stone-400">Usually replies within a few hours</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.sender === "customer" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
              msg.sender === "customer"
                ? "bg-(--color-accent) text-white rounded-br-md"
                : "bg-stone-100 text-stone-800 rounded-bl-md"
            }`}>
              <p className="text-sm">{msg.text}</p>
              <div className={`flex items-center gap-1 mt-1 ${msg.sender === "customer" ? "justify-end" : ""}`}>
                <span className={`text-xs ${msg.sender === "customer" ? "text-white/60" : "text-stone-400"}`}>
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                </span>
                {msg.sender === "customer" && (
                  msg.read
                    ? <CheckCheck size={12} className="text-white/60" />
                    : <Check size={12} className="text-white/60" />
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {!readOnly && (
        <div className="border-t border-stone-200 p-3 flex gap-2">
          <input
            type="text"
            value={newMessage}
            onChange={e => setNewMessage(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSend()}
            placeholder="Type a message..."
            className="flex-1 border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-(--color-accent)/30 focus:border-(--color-accent)"
          />
          <button
            onClick={handleSend}
            disabled={!newMessage.trim()}
            className="px-4 py-2 bg-(--color-accent) text-white rounded-lg hover:bg-(--color-accent-hover) disabled:opacity-50"
          >
            <Send size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

function NotificationPreferences({ readOnly }: { readOnly: boolean }) {
  const [prefs, setPrefs] = useState({
    appointmentReminders: { email: true, sms: true, push: true },
    vaccinationAlerts: { email: true, sms: false, push: true },
    promotional: { email: false, sms: false, push: false },
    reportCards: { email: true, sms: false, push: true },
    invoiceReceipts: { email: true, sms: false, push: false },
  });

  type PrefKey = keyof typeof prefs;
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
    { key: "vaccinationAlerts", label: "Vaccination Alerts", desc: "Expiration and renewal reminders", icon: FileText },
    { key: "promotional", label: "Promotions & Offers", desc: "Deals and seasonal specials", icon: Megaphone },
    { key: "reportCards", label: "Report Cards", desc: "Grooming report card delivery", icon: FileText },
    { key: "invoiceReceipts", label: "Invoice & Receipts", desc: "Payment confirmations", icon: CreditCard },
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
