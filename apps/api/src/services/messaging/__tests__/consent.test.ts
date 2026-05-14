import { describe, it, expect, vi, beforeEach } from "vitest";
import { detectKeyword } from "../consent.js";

const mockDb = {
  insert: vi.fn(),
  update: vi.fn(),
  select: vi.fn(),
};

vi.mock("@groombook/db", () => ({
  getDb: () => mockDb,
  clients: {},
  messageConsentEvents: {},
  businessSettings: {},
  eq: vi.fn(),
}));

const { handleConsentKeyword } = await import("../consent.js");

describe("detectKeyword", () => {
  it.each([
    ["STOP", "opt_out"],
    ["STOPALL", "opt_out"],
    ["UNSUBSCRIBE", "opt_out"],
    ["CANCEL", "opt_out"],
    ["END", "opt_out"],
    ["QUIT", "opt_out"],
  ])("opt-out keyword %s → opt_out", (keyword, expected) => {
    expect(detectKeyword(keyword)).toEqual({ kind: expected });
  });

  it.each([
    ["START", "opt_in"],
    ["UNSTOP", "opt_in"],
    ["YES", "opt_in"],
    ["SUBSCRIBE", "opt_in"],
  ])("opt-in keyword %s → opt_in", (keyword, expected) => {
    expect(detectKeyword(keyword)).toEqual({ kind: expected });
  });

  it.each([
    ["HELP", "help"],
    ["INFO", "help"],
  ])("help keyword %s → help", (keyword, expected) => {
    expect(detectKeyword(keyword)).toEqual({ kind: expected });
  });

  it("is case insensitive", () => {
    expect(detectKeyword("stop")).toEqual({ kind: "opt_out" });
    expect(detectKeyword("Stop")).toEqual({ kind: "opt_out" });
    expect(detectKeyword("sToP")).toEqual({ kind: "opt_out" });
  });

  it("trims whitespace", () => {
    expect(detectKeyword("  STOP  ")).toEqual({ kind: "opt_out" });
    expect(detectKeyword("\tSTART\n")).toEqual({ kind: "opt_in" });
  });

  it("returns null for non-keyword messages", () => {
    expect(detectKeyword("hello")).toBeNull();
    expect(detectKeyword("STOP IT")).toBeNull();
    expect(detectKeyword("help me")).toBeNull();
  });
});

describe("handleConsentKeyword", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockResolvedValue([{ id: "event-1" }]),
    } as any);
    mockDb.update.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    } as any);
  });

  const baseOpts = {
    clientId: "client-1",
    businessId: "biz-1",
    db: mockDb as unknown as ReturnType<typeof import("@groombook/db").getDb>,
  };

  describe("opt_out", () => {
    it("inserts consent event with sms_keyword source", async () => {
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ smsOptIn: true }]),
          }),
        }),
      } as any);

      await handleConsentKeyword({ ...baseOpts, kind: "opt_out" });

      expect(mockDb.insert).toHaveBeenCalledOnce();
    });

    it("sets smsOptIn=false and smsOptOutDate when currently opted in", async () => {
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ smsOptIn: true }]),
          }),
        }),
      } as any);

      await handleConsentKeyword({ ...baseOpts, kind: "opt_out" });

      expect(mockDb.update).toHaveBeenCalled();
    });

    it("is idempotent — second opt-out logs event but skips client update", async () => {
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ smsOptIn: false }]),
          }),
        }),
      } as any);

      await handleConsentKeyword({ ...baseOpts, kind: "opt_out" });

      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it("returns unsubscribe reply text", async () => {
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ smsOptIn: true }]),
          }),
        }),
      } as any);

      const result = await handleConsentKeyword({ ...baseOpts, kind: "opt_out" });
      expect(result.replyText).toBe(
        "You have been unsubscribed and will no longer receive messages. Reply START to resubscribe."
      );
    });
  });

  describe("opt_in", () => {
    it("sets smsOptIn=true and smsConsentDate when currently opted out", async () => {
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ smsOptIn: false, smsConsentDate: null }]),
          }),
        }),
      } as any);

      await handleConsentKeyword({ ...baseOpts, kind: "opt_in" });

      expect(mockDb.update).toHaveBeenCalled();
    });

    it("clears smsOptOutDate on opt-in after opt-out", async () => {
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ smsOptIn: false }]),
          }),
        }),
      } as any);

      await handleConsentKeyword({ ...baseOpts, kind: "opt_in" });

      expect(mockDb.update).toHaveBeenCalled();
    });

    it("is idempotent — second opt-in skips client update", async () => {
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ smsOptIn: true }]),
          }),
        }),
      } as any);

      await handleConsentKeyword({ ...baseOpts, kind: "opt_in" });

      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it("returns resubscribe reply text", async () => {
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ smsOptIn: false }]),
          }),
        }),
      } as any);

      const result = await handleConsentKeyword({ ...baseOpts, kind: "opt_in" });
      expect(result.replyText).toBe(
        "You have been resubscribed to messages. Reply STOP to unsubscribe. Msg & data rates may apply."
      );
    });
  });

  describe("help", () => {
    it("returns default help reply without querying businessSettings", async () => {
      const result = await handleConsentKeyword({ ...baseOpts, kind: "help" });

      expect(mockDb.update).not.toHaveBeenCalled();
      expect(mockDb.select).not.toHaveBeenCalled();
      expect(result.replyText).toBe(
        "Reply STOP to unsubscribe or START to resubscribe. For help, contact your groomer directly."
      );
    });
  });
});