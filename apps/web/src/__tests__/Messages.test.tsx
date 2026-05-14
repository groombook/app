import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MessagesPage } from "../pages/Messages.js";

const mockConversations = [
  {
    id: "conv-1",
    clientId: "client-1",
    clientName: "Alice Smith",
    channel: "sms",
    clientPhone: "+1234567890",
    lastMessageAt: "2026-05-14T10:00:00Z",
    lastMessage: { body: "Hello, is my dog ready?", direction: "inbound", createdAt: "2026-05-14T10:00:00Z" },
    unreadCount: 2,
    status: "active",
  },
  {
    id: "conv-2",
    clientId: "client-2",
    clientName: "Bob Jones",
    channel: "sms",
    clientPhone: "+1987654321",
    lastMessageAt: "2026-05-13T08:00:00Z",
    lastMessage: { body: "Thanks for the update", direction: "outbound", createdAt: "2026-05-13T08:05:00Z" },
    unreadCount: 0,
    status: "active",
  },
];

const mockMessages = [
  {
    id: "msg-1",
    direction: "inbound" as const,
    body: "Hello, is my dog ready?",
    status: "delivered",
    createdAt: "2026-05-14T10:00:00Z",
    sentByStaffId: null,
  },
  {
    id: "msg-2",
    direction: "outbound" as const,
    body: "Yes, she is all done!",
    status: "delivered",
    createdAt: "2026-05-14T10:05:00Z",
    sentByStaffId: "staff-1",
  },
];

const makeResponse = (data: unknown): Response => {
  return {
    ok: true,
    json: () => Promise.resolve(data),
  } as Response;
};

const makeResponseWithStatus = (data: unknown, status: number): Response => {
  return {
    ok: true,
    status,
    json: () => Promise.resolve(data),
  } as Response;
};

beforeEach(() => {
  global.fetch = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("MessagesPage", () => {
  it("renders empty state when no conversations", async () => {
    vi.mocked(global.fetch).mockResolvedValue(makeResponse({ items: [], nextCursor: null }));

    render(<MessagesPage />);
    await waitFor(() => {
      expect(screen.getByText("No conversations yet")).toBeInTheDocument();
    });
  });

  it("renders conversation list", async () => {
    vi.mocked(global.fetch).mockResolvedValue(makeResponse({ items: mockConversations, nextCursor: null }));

    render(<MessagesPage />);
    await waitFor(() => {
      expect(screen.getByText("Alice Smith")).toBeInTheDocument();
      expect(screen.getByText("Bob Jones")).toBeInTheDocument();
    });

    const unreadBadges = screen.getAllByText("2");
    expect(unreadBadges).toHaveLength(1);
  });

  it("loads and displays messages when thread is selected", async () => {
    vi.mocked(global.fetch).mockImplementation((input) => {
      const url = String(input);
      if (url === "/api/conversations?limit=20") {
        return Promise.resolve(makeResponse({ items: mockConversations, nextCursor: null }));
      }
      if (url === "/api/conversations/conv-1/messages?limit=50") {
        return Promise.resolve(makeResponse({ items: mockMessages, nextCursor: null }));
      }
      return Promise.resolve(makeResponseWithStatus(null, 404));
    });

    render(<MessagesPage />);

    await waitFor(() => screen.getByText("Alice Smith"));
    fireEvent.click(screen.getByText("Alice Smith"));

    await waitFor(() => {
      expect(screen.getAllByText("Hello, is my dog ready?").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("Yes, she is all done!")).toBeInTheDocument();
    });
  });

  it("sends a message on form submit", async () => {
    let capturedBody: unknown = null;
    vi.mocked(global.fetch).mockImplementation((input, init) => {
      const url = String(input);
      if (url.includes("/messages") && init?.method === "POST") {
        capturedBody = init?.body;
        return Promise.resolve(makeResponseWithStatus({
          id: "msg-new",
          direction: "outbound",
          body: "Test message",
          status: "queued",
          createdAt: new Date().toISOString(),
          sentByStaffId: "staff-1",
        }, 201));
      }
      return Promise.resolve(makeResponse({ items: mockConversations, nextCursor: null }));
    });

    render(<MessagesPage />);

    await waitFor(() => screen.getByText("Alice Smith"));
    fireEvent.click(screen.getByText("Alice Smith"));

    await waitFor(() => screen.getByPlaceholderText("Type a message…"));
    fireEvent.change(screen.getByPlaceholderText("Type a message…"), {
      target: { value: "Test message" },
    });
    fireEvent.click(screen.getByText("Send"));

    await waitFor(() => {
      expect(capturedBody).toBe('{"body":"Test message"}');
    });
  });
});
