import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  findOrCreateConversation,
  upsertMessage,
  handleMessageReceived,
  handleMessageFinalized,
  TelnyxMessageReceivedPayload,
} from "../inbound.js";
import * as schema from "@groombook/db";

vi.mock("@groombook/db", () => ({
  getDb: vi.fn(),
  conversations: { id: "", businessId: "", clientId: "", externalNumber: "", businessNumber: "", channel: "", lastMessageAt: null, status: "", createdAt: null, updatedAt: null },
  messages: { id: "", conversationId: "", direction: "", body: "", status: "", providerMessageId: "", sentByStaffId: null, createdAt: null, deliveredAt: null, readByClientAt: null },
  businessSettings: { id: "", messagingPhoneNumber: "" },
  eq: vi.fn(),
  and: vi.fn(),
  sql: vi.fn(),
}));

const mockDb = {
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  returning: vi.fn().mockReturnThis(),
};

vi.mocked(schema.getDb).mockReturnValue(mockDb as unknown as ReturnType<typeof schema.getDb>);

const makePayload = (
  eventType: "message.received" | "message.sent" | "message.finalized",
  messageId: string,
  fromPhone: string,
  toPhone: string,
  body = "Hello"
): TelnyxMessageReceivedPayload => ({
  data: {
    id: "evt-1",
    event_type: eventType,
    payload: {
      message: {
        id: messageId,
        from: { phone: fromPhone, carrier: "carrier" },
        to: [{ phone: toPhone }],
        body,
      },
    },
  },
});

describe("signature validation via route", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns 401 when telnyx-signature header is missing", async () => {
    const { telnyxWebhooksRouter } = await import("../../../routes/webhooks/telnyx.js");
    const payload = JSON.stringify(makePayload("message.received", "msg-123", "+1555111", "+1555222"));
    const req = new Request("http://localhost/api/webhooks/telnyx/messaging", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
    });
    const res = await telnyxWebhooksRouter.fetch(req);
    expect(res.status).toBe(401);
  });

  it("returns 401 when signature does not match", async () => {
    process.env.TELNYX_WEBHOOK_SECRET = "test-secret";
    const { telnyxWebhooksRouter } = await import("../../../routes/webhooks/telnyx.js");
    const payload = JSON.stringify(makePayload("message.received", "msg-123", "+1555111", "+1555222"));
    const req = new Request("http://localhost/api/webhooks/telnyx/messaging", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "telnyx-signature": "sha256=bad",
      },
      body: payload,
    });
    const res = await telnyxWebhooksRouter.fetch(req);
    expect(res.status).toBe(401);
  });
});

describe("findOrCreateConversation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.select.mockReset();
    mockDb.from.mockReset();
    mockDb.where.mockReset();
    mockDb.limit.mockReset();
    mockDb.insert.mockReset();
    mockDb.update.mockReset();
    mockDb.returning.mockReset();
  });

  it("returns existing conversation when found", async () => {
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue([{ id: "conv-1", clientId: "client-1" }]),
        }),
      }),
    });

    const result = await findOrCreateConversation("biz-1", "+1555111", "+1555222");
    expect(result.id).toBe("conv-1");
  });

  it("creates new conversation when none exists", async () => {
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue([]),
        }),
      }),
    });
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockReturnValue([{ id: "conv-2", clientId: "client-2" }]),
      }),
    });

    const result = await findOrCreateConversation("biz-1", "+1555111", "+1555222");
    expect(result.id).toBe("conv-2");
  });
});

describe("upsertMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns isNew=false when message with providerMessageId already exists", async () => {
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue([{ id: "msg-existing" }]),
        }),
      }),
    });

    const result = await upsertMessage("msg-123", "conv-1", "inbound", "Hello", "received");
    expect(result.isNew).toBe(false);
    expect(result.id).toBe("msg-existing");
  });

  it("inserts new message and returns isNew=true", async () => {
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue([]),
        }),
      }),
    });
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockReturnValue([{ id: "msg-new" }]),
      }),
    });

    const result = await upsertMessage("msg-new-123", "conv-1", "inbound", "New message", "queued");
    expect(result.isNew).toBe(true);
    expect(result.id).toBe("msg-new");
  });
});

describe("handleMessageReceived", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.select.mockReset();
    mockDb.from.mockReset();
    mockDb.where.mockReset();
    mockDb.limit.mockReset();
    mockDb.insert.mockReset();
    mockDb.update.mockReset();
    mockDb.returning.mockReset();
  });

  it("returns 404 when no business owns the to number", async () => {
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue([]),
        }),
      }),
    });

    const payload = makePayload("message.received", "msg-123", "+1555111", "+1555000");
    await expect(handleMessageReceived(payload)).rejects.toThrow("No business owns messaging number");
  });

  it("creates conversation and message for valid inbound", async () => {
    mockDb.select
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue([]),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue([{ id: "biz-1" }]),
          }),
        }),
      });

    mockDb.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockReturnValue([{ id: "conv-new", clientId: "client-1" }]),
      }),
    });
    mockDb.update.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({}),
      }),
    });
    mockDb.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue([]),
        }),
      }),
    });
    mockDb.insert.mockReturnValueOnce({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockReturnValue([{ id: "msg-new" }]),
      }),
    });

    const payload = makePayload("message.received", "msg-abc", "+1555111", "+1555222", "Test message");
    const result = await handleMessageReceived(payload);
    expect(result.messageId).toBe("msg-new");
  });
});

describe("handleMessageFinalized", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when message not found", async () => {
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue([]),
        }),
      }),
    });

    const payload = makePayload("message.finalized", "msg-unknown", "+1555111", "+1555222");
    const result = await handleMessageFinalized(payload);
    expect(result).toBeNull();
  });

  it("updates status to delivered for finalized inbound", async () => {
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue([{ id: "msg-1", status: "sent" }]),
        }),
      }),
    });
    mockDb.update.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({}),
      }),
    });

    const payload = makePayload("message.finalized", "msg-1", "+1555111", "+1555222");
    const result = await handleMessageFinalized(payload);
    expect(result?.newStatus).toBe("delivered");
  });
});
