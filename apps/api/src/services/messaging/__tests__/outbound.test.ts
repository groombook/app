import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSendSms = vi.fn();
const mockGetDb = vi.fn();
const mockUuidv4 = vi.fn();

vi.mock("../sms.js", () => ({
  sendSms: mockSendSms,
}));

vi.mock("@groombook/db", () => ({
  getDb: () => mockGetDb(),
  conversations: {},
  messages: {},
  clients: {},
  businessSettings: {},
  eq: vi.fn((a, b) => [a, b]),
  and: vi.fn((...args) => args),
}));

vi.mock("uuid", () => ({
  v4: () => mockUuidv4(),
}));

const { sendMessage, MissingTenantPhoneNumberError } = await import("../outbound.ts");

const mockEq = (a: unknown, b: unknown) => [a, b];
const mockAnd = (...args: unknown[]) => args;

describe("sendMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUuidv4.mockReturnValue("test-uuid");
  });

  function buildSelectMock(results: unknown[]) {
    return vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(results),
        }),
      }),
    });
  }

  it("returns suppressed=true when client has no phone", async () => {
    mockGetDb.mockReturnValue({
      select: buildSelectMock([{ phone: null, smsOptIn: true }]),
    });

    const result = await sendMessage({
      businessId: "biz-1",
      clientId: "client-1",
      body: "Hello",
    });

    expect(result).toEqual({ suppressed: true });
    expect(mockSendSms).not.toHaveBeenCalled();
  });

  it("returns suppressed=true when client has opted out of SMS", async () => {
    mockGetDb.mockReturnValue({
      select: buildSelectMock([{ phone: "+1234567890", smsOptIn: false }]),
    });

    const result = await sendMessage({
      businessId: "biz-1",
      clientId: "client-1",
      body: "Hello",
    });

    expect(result).toEqual({ suppressed: true });
    expect(mockSendSms).not.toHaveBeenCalled();
  });

  it("throws MissingTenantPhoneNumberError when tenant has no messaging phone", async () => {
    mockGetDb.mockReturnValue({
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ phone: "+1234567890", smsOptIn: true }]),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ messagingPhoneNumber: null }]),
            }),
          }),
        }),
    });

    await expect(
      sendMessage({ businessId: "biz-1", clientId: "client-1", body: "Hello" })
    ).rejects.toThrow(MissingTenantPhoneNumberError);
  });

  it("persists provider message id on success", async () => {
    const messageId = "msg-1";
    const conversationId = "conv-1";

    mockGetDb.mockReturnValue({
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ phone: "+1234567890", smsOptIn: true }]),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ messagingPhoneNumber: "+1987654321" }]),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ id: conversationId }]),
            }),
          }),
        }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: messageId }]),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    mockSendSms.mockResolvedValue({ messageId: "provider-msg-1", status: "sent" });

    const result = await sendMessage({
      businessId: "biz-1",
      clientId: "client-1",
      body: "Hello",
    });

    expect(result).toEqual({
      messageId,
      providerMessageId: "provider-msg-1",
      status: "sent",
      suppressed: false,
    });
    expect(mockSendSms).toHaveBeenCalledWith("+1234567890", "Hello", undefined);
  });

  it("persists error on Telnyx failure", async () => {
    const messageId = "msg-1";

    mockGetDb.mockReturnValue({
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ phone: "+1234567890", smsOptIn: true }]),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ messagingPhoneNumber: "+1987654321" }]),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: messageId }]),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    mockSendSms.mockRejectedValue(new Error("Telnyx API error"));

    await expect(
      sendMessage({ businessId: "biz-1", clientId: "client-1", body: "Hello" })
    ).rejects.toThrow("Telnyx API error");
  });
});