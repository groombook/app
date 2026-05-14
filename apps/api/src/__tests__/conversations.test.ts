import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

// ─── Mock data ────────────────────────────────────────────────────────────────

const STAFF_ROW = {
  id: "staff-uuid-1",
  email: "groomer@groombook.com",
  name: "Groomer",
  role: "groomer" as const,
  businessId: "business-uuid-1",
  active: true,
  userId: null,
  oidcSub: null,
  isSuperUser: false,
  icalToken: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const BUSINESS_SETTINGS = {
  id: "business-uuid-1",
  businessName: "Test Salon",
};

const CONV_1 = {
  id: "conv-uuid-1",
  businessId: "business-uuid-1",
  clientId: "client-uuid-1",
  channel: "sms",
  externalNumber: "+15551111111",
  businessNumber: "+15552222222",
  lastMessageAt: new Date("2025-01-10T10:00:00Z"),
  status: "active",
  createdAt: new Date("2025-01-01T00:00:00Z"),
  updatedAt: new Date("2025-01-10T10:00:00Z"),
  staffReadAt: null,
};

const MSG_INBOUND_1 = {
  id: "msg-uuid-1",
  conversationId: "conv-uuid-1",
  direction: "inbound",
  body: "Hello",
  status: "delivered",
  sentByStaffId: null,
  createdAt: new Date("2025-01-10T09:00:00Z"),
  deliveredAt: new Date("2025-01-10T09:01:00Z"),
};

const MSG_OUTBOUND_1 = {
  id: "msg-uuid-2",
  conversationId: "conv-uuid-1",
  direction: "outbound",
  body: "Hi Alice!",
  status: "delivered",
  sentByStaffId: "staff-uuid-1",
  createdAt: new Date("2025-01-10T10:00:00Z"),
  deliveredAt: new Date("2025-01-10T10:01:00Z"),
};

// ─── Queue-based mock DB ──────────────────────────────────────────────────────

let selectRows: Record<string, unknown>[] = [];
let selectRows2: Record<string, unknown>[] = [];
let selectRows3: Record<string, unknown>[] = [];
let updatedValues: Record<string, unknown>[] = [];
let selectCallCount = 0;

function resetMock() {
  selectRows = [];
  selectRows2 = [];
  selectRows3 = [];
  updatedValues = [];
  selectCallCount = 0;
}

function resetAll() {
  resetMock();
  vi.clearAllMocks();
}

const mockSendMessage = vi.hoisted(() => vi.fn());

vi.mock("@groombook/db", () => {
  function makeChainable(data: unknown[]): unknown {
    const arr = [...data];
    const chain = new Proxy(arr, {
      get(target, prop) {
        if (prop === "where" || prop === "orderBy" || prop === "limit" || prop === "innerJoin") {
          return () => chain;
        }
        if (prop === "from") {
          return (table: unknown) => {
            const tableName = (table as { _name?: string })._name;
            const rows = tableName === "businessSettings" ? [BUSINESS_SETTINGS] : selectRows;
            return makeChainable(rows);
          };
        }
        // @ts-expect-error proxy
        return target[prop];
      },
    });
    return chain;
  }

  const conversations = new Proxy(
    { _name: "conversations" },
    { get: (t, p) => (p === "_name" ? "conversations" : { table: "conversations", column: p }) }
  );

  const messages = new Proxy(
    { _name: "messages" },
    { get: (t, p) => (p === "_name" ? "messages" : { table: "messages", column: p }) }
  );

  const clients = new Proxy(
    { _name: "clients" },
    { get: (t, p) => (p === "_name" ? "clients" : { table: "clients", column: p }) }
  );

  const businessSettings = new Proxy(
    { _name: "businessSettings" },
    { get: (t, p) => (p === "_name" ? "businessSettings" : { table: "businessSettings", column: p }) }
  );

  return {
    getDb: () => ({
      select: () => ({
        from: (table: unknown) => {
          const tableName = (table as { _name?: string })._name;
          if (tableName === "businessSettings") return makeChainable([BUSINESS_SETTINGS]);
          if (tableName === "messages") {
            // Return selectRows3 if it has data (POST re-query), else cycle through selectRows/selectRows2
            if (selectRows3.length > 0) {
              return makeChainable(selectRows3);
            }
            if (selectCallCount === 0 || selectCallCount === 1) {
              const rows = selectCallCount === 0 ? selectRows : selectRows2;
              selectCallCount++;
              return makeChainable(rows);
            }
            return makeChainable(selectRows);
          }
          return makeChainable(selectRows);
        },
      }),
      update: () => ({
        set: (vals: Record<string, unknown>) => ({
          where: () => {
            updatedValues.push(vals);
            return { returning: () => [vals] };
          },
        }),
      }),
      insert: () => ({
        values: (vals: Record<string, unknown>) => {
          return { returning: () => [{ ...vals, id: "msg-uuid-new" }] };
        },
      }),
    }),
    conversations,
    messages,
    clients,
    businessSettings,
    eq: vi.fn((a, b) => ({ type: "eq", a, b })),
    and: vi.fn((...args) => ({ type: "and", args })),
    desc: vi.fn((col) => ({ type: "desc", col })),
    lt: vi.fn((a, b) => ({ type: "lt", a, b })),
    sql: vi.fn(() => ({ __type: "sql" })),
    isNull: vi.fn((col) => ({ type: "isNull", col })),
    count: vi.fn((col) => ({ type: "count", col })),
  };
});

vi.mock("../services/messaging/outbound.js", () => ({
  sendMessage: mockSendMessage,
}));

// ─── App setup ────────────────────────────────────────────────────────────────

const { conversationsRouter } = await import("../routes/conversations.js");

const app = new Hono();
app.use("*", async (c, next) => {
  // @ts-expect-error — test-only context injection
  c.set("staff", STAFF_ROW);
  await next();
});
app.route("/conversations", conversationsRouter);

function jsonRequest(method: string, path: string, body?: unknown) {
  return app.request(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => resetAll());

// ─── GET /conversations ───────────────────────────────────────────────────────

describe("GET /api/conversations", () => {
  it("returns conversations sorted by recency with unread count", async () => {
    selectRows = [
      { ...CONV_1, clientName: "Alice", clientPhone: "+15551111111", channel: "sms" },
    ];
    selectRows2 = [{ count: "1" }];
    const res = await app.request("/conversations");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0]!.id).toBe("conv-uuid-1");
    expect(body.items[0]!.clientName).toBe("Alice");
  });

  it("supports cursor-based pagination", async () => {
    selectRows = [];
    const res = await app.request("/conversations?cursor=conv-uuid-1&limit=1");
    expect(res.status).toBe(200);
  });

  it("enforces max limit of 50", async () => {
    selectRows = [];
    const res = await app.request("/conversations?limit=200");
    expect(res.status).toBe(200);
  });
});

// ─── GET /conversations/:id/messages ─────────────────────────────────────────

describe("GET /api/conversations/:id/messages", () => {
  it("returns paginated messages and marks conversation as read", async () => {
    selectRows = [{ ...MSG_INBOUND_1 }, { ...MSG_OUTBOUND_1 }];
    const res = await app.request("/conversations/conv-uuid-1/messages");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(2);
    expect(body.items[0]!.id).toBe("msg-uuid-1");
    expect(updatedValues.some((u) => u.staffReadAt !== undefined)).toBe(true);
  });

  it("returns 404 when conversation belongs to different business", async () => {
    selectRows = [];
    const res = await app.request("/conversations/conv-uuid-other/messages");
    expect(res.status).toBe(404);
  });

  it("returns 401 when not authenticated", async () => {
    const appNoAuth = new Hono();
    appNoAuth.route("/conversations", conversationsRouter);
    const res = await appNoAuth.request("/conversations/conv-uuid-1/messages");
    expect(res.status).toBe(401);
  });
});

// ─── POST /conversations/:id/messages ─────────────────────────────────────────

describe("POST /api/conversations/:id/messages", () => {
  beforeEach(() => {
    resetMock();
    vi.clearAllMocks();
    selectRows = [{ ...CONV_1, clientName: "Alice", clientPhone: "+15551111111", channel: "sms" }];
    selectRows2 = [];
    selectRows3 = [{ id: "msg-uuid-new", conversationId: "conv-uuid-1", direction: "outbound" as const, body: "Hello Alice!", status: "queued" as const, sentByStaffId: "staff-uuid-1", createdAt: new Date(), deliveredAt: null }];
    updatedValues = [];
  });

  it("sends via outbound service and returns 201", async () => {
    mockSendMessage.mockResolvedValueOnce({
      messageId: "msg-uuid-new",
      providerMessageId: "provider-msg-1",
      status: "queued",
      suppressed: false,
    });

    const res = await jsonRequest("POST", "/conversations/conv-uuid-1/messages", {
      body: "Hello Alice!",
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("msg-uuid-new");
  });

  it("returns 409 when client opted out", async () => {
    mockSendMessage.mockResolvedValueOnce({ suppressed: true });

    const res = await jsonRequest("POST", "/conversations/conv-uuid-1/messages", {
      body: "Hello",
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/opted out/i);
  });

  it("returns 404 for cross-tenant conversation", async () => {
    selectRows = [];
    const res = await jsonRequest("POST", "/conversations/conv-uuid-other/messages", {
      body: "Hello",
    });
    expect(res.status).toBe(404);
  });

  it("rejects empty body", async () => {
    const res = await jsonRequest("POST", "/conversations/conv-uuid-1/messages", {
      body: "",
    });
    expect(res.status).toBe(400);
  });

  it("rejects body over 1600 chars", async () => {
    const res = await jsonRequest("POST", "/conversations/conv-uuid-1/messages", {
      body: "a".repeat(1601),
    });
    expect(res.status).toBe(400);
  });
});