import { useEffect, useState, useRef } from "react";

interface Conversation {
  id: string;
  clientId: string;
  clientName: string;
  channel: string;
  externalNumber: string;
  lastMessageAt: string | null;
  staffReadAt: string | null;
  lastMessageBody: string | null;
  unreadCount: number;
  status: string;
}

interface Message {
  id: string;
  direction: "inbound" | "outbound";
  body: string | null;
  status: string;
  createdAt: string;
  sentByStaffId: string | null;
}

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function truncate(text: string | null, max: number): string {
  if (!text) return "";
  return text.length > max ? text.slice(0, max) + "…" : text;
}

export function MessagesPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messageError, setMessageError] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  async function loadConversations() {
    try {
      const res = await fetch("/api/conversations?limit=20");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as Conversation[];
      setConversations(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load conversations");
    }
  }

  async function loadMessages(conversationId: string) {
    setMessagesLoading(true);
    setMessageError(null);
    try {
      const res = await fetch(`/api/conversations/${conversationId}/messages?limit=50`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { messages: Message[] };
      setMessages(data.messages);
    } catch (e: unknown) {
      setMessageError(e instanceof Error ? e.message : "Failed to load messages");
    } finally {
      setMessagesLoading(false);
    }
  }

  useEffect(() => {
    loadConversations().finally(() => setLoading(false));
    const interval = setInterval(loadConversations, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (selectedId) {
      loadMessages(selectedId);
    } else {
      setMessages([]);
    }
  }, [selectedId]);

  useEffect(() => {
    if (messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId || !body.trim() || sending) return;
    setSending(true);
    setMessageError(null);

    const optimistic: Message = {
      id: `temp-${Date.now()}`,
      direction: "outbound",
      body: body.trim(),
      status: "queued",
      createdAt: new Date().toISOString(),
      sentByStaffId: null,
    };

    setMessages((prev) => [...prev, optimistic]);
    const currentBody = body;
    setBody("");

    try {
      const res = await fetch(`/api/conversations/${selectedId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: currentBody }),
      });

      if (res.status === 409) {
        const data = (await res.json()) as { error?: string };
        setMessageError(data.error ?? "Client has opted out of SMS");
        setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
        return;
      }

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }

      const sent = (await res.json()) as Message;
      setMessages((prev) => prev.map((m) => (m.id === optimistic.id ? sent : m)));
      loadConversations();
    } catch (e: unknown) {
      setMessageError(e instanceof Error ? e.message : "Failed to send message");
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{ display: "flex", height: "calc(100vh - 90px)", fontFamily: "system-ui, sans-serif" }}>
      {/* Thread list */}
      <div style={{ width: 320, borderRight: "1px solid #e5e7eb", overflowY: "auto", background: "#fff" }}>
        <div style={{ padding: "0.75rem 1rem", borderBottom: "1px solid #f3f4f6", fontWeight: 600, fontSize: 14, color: "#374151" }}>
          Conversations
        </div>
        {loading ? (
          <p style={{ padding: "1rem", color: "#6b7280", fontSize: 13 }}>Loading…</p>
        ) : error ? (
          <p style={{ padding: "1rem", color: "#ef4444", fontSize: 13 }}>{error}</p>
        ) : conversations.length === 0 ? (
          <p style={{ padding: "1rem", color: "#6b7280", fontSize: 13 }}>No conversations yet</p>
        ) : (
          conversations.map((conv) => (
            <div
              key={conv.id}
              onClick={() => setSelectedId(conv.id)}
              style={{
                padding: "0.75rem 1rem",
                borderBottom: "1px solid #f3f4f6",
                cursor: "pointer",
                background: selectedId === conv.id ? "#ecfdf5" : "transparent",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <span style={{ fontWeight: 500, fontSize: 14, color: "#1a202c" }}>{conv.clientName}</span>
                {conv.unreadCount > 0 && (
                  <span style={{ background: "#10b981", color: "#fff", borderRadius: 10, padding: "1px 6px", fontSize: 11, fontWeight: 600 }}>
                    {conv.unreadCount}
                  </span>
                )}
              </div>
              <div style={{ marginTop: 2, color: "#6b7280", fontSize: 12 }}>
                {truncate(conv.lastMessageBody, 60)}
              </div>
              <div style={{ marginTop: 2, color: "#9ca3af", fontSize: 11 }}>
                {relativeTime(conv.lastMessageAt)}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Conversation view */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#f9fafb" }}>
        {!selectedId ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af" }}>
            Select a conversation
          </div>
        ) : messagesLoading ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#6b7280" }}>
            Loading messages…
          </div>
        ) : (
          <>
            <div style={{ flex: 1, overflowY: "auto", padding: "1rem" }}>
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: msg.direction === "outbound" ? "flex-end" : "flex-start",
                    marginBottom: "0.75rem",
                  }}
                >
                  <div
                    style={{
                      maxWidth: "70%",
                      padding: "0.5rem 0.75rem",
                      borderRadius: 12,
                      background: msg.direction === "outbound" ? "var(--color-primary, #4f8a6f)" : "#fff",
                      color: msg.direction === "outbound" ? "#fff" : "#1a202c",
                      border: msg.direction === "inbound" ? "1px solid #e5e7eb" : "none",
                      fontSize: 14,
                      lineHeight: 1.5,
                    }}
                  >
                    {msg.body}
                  </div>
                  <span style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>
                    {new Date(msg.createdAt).toLocaleString()}
                  </span>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {messageError && (
              <div style={{ margin: "0 1rem 0.5rem", padding: "0.5rem 0.75rem", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, color: "#991b1b", fontSize: 13 }}>
                {messageError}
              </div>
            )}

            <form onSubmit={handleSend} style={{ display: "flex", gap: "0.5rem", padding: "0.75rem 1rem", borderTop: "1px solid #e5e7eb", background: "#fff" }}>
              <input
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Type a message…"
                disabled={sending}
                style={{ flex: 1, padding: "0.5rem 0.75rem", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 14 }}
              />
              <button
                type="submit"
                disabled={sending || !body.trim()}
                style={{
                  padding: "0.5rem 1rem",
                  background: "var(--color-primary, #4f8a6f)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: sending ? "wait" : "pointer",
                  opacity: sending ? 0.7 : 1,
                }}
              >
                {sending ? "Sending…" : "Send"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
