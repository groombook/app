export interface Conversation {
  id: string;
  channel: string;
  lastMessageAt: string | null;
  status: string;
  createdAt: string;
}

export interface Message {
  id: string;
  direction: "inbound" | "outbound";
  body: string | null;
  status: string;
  createdAt: string;
  deliveredAt: string | null;
}

export interface MessagesResponse {
  messages: Message[];
  nextCursor: string | null;
}

export async function fetchConversation(sessionId: string): Promise<Conversation | null> {
  const res = await fetch("/api/portal/conversation", {
    headers: { "X-Impersonation-Session-Id": sessionId },
  });
  if (res.status === 204) return null;
  if (!res.ok) throw new Error("Failed to fetch conversation");
  return res.json();
}

export async function fetchMessages(
  sessionId: string,
  cursor?: string,
  limit?: number
): Promise<MessagesResponse> {
  const params = new URLSearchParams();
  if (cursor) params.set("cursor", cursor);
  if (limit) params.set("limit", String(limit));
  const query = params.toString();

  const res = await fetch(`/api/portal/conversation/messages${query ? `?${query}` : ""}`, {
    headers: { "X-Impersonation-Session-Id": sessionId },
  });
  if (res.status === 204) return { messages: [], nextCursor: null };
  if (!res.ok) throw new Error("Failed to fetch messages");
  return res.json();
}

import { useState, useEffect } from "react";

export function useConversation(sessionId: string | null): {
  conversation: Conversation | null;
  loading: boolean;
  error: string | null;
} {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setLoading(false);
      setConversation(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchConversation(sessionId)
      .then((conv) => {
        if (!cancelled) {
          setConversation(conv);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "An error occurred");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  return { conversation, loading, error };
}

export function useMessages(sessionId: string | null): {
  messages: Message[];
  loading: boolean;
  error: string | null;
  loadMore: () => void;
  hasMore: boolean;
} {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (!sessionId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setMessages([]);
    setCursor(undefined);
    setHasMore(false);

    fetchMessages(sessionId)
      .then((res) => {
        if (!cancelled) {
          setMessages(res.messages);
          setCursor(res.nextCursor ?? undefined);
          setHasMore(res.nextCursor !== null);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "An error occurred");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const loadMore = () => {
    if (loadingMore || !hasMore || !sessionId) return;
    setLoadingMore(true);

    fetchMessages(sessionId, cursor)
      .then((res) => {
        setMessages((prev) => [...prev, ...res.messages]);
        setCursor(res.nextCursor ?? undefined);
        setHasMore(res.nextCursor !== null);
        setLoadingMore(false);
      })
      .catch(() => {
        setLoadingMore(false);
      });
  };

  return { messages, loading, error, loadMore, hasMore };
}