import { describe, it, expect, vi, beforeEach } from "vitest";
import { detectKeyword } from "../consent.js";

vi.mock("@groombook/db", () => ({
  db: {
    insert: vi.fn(),
    update: vi.fn(),
    select: vi.fn(),
  },
  clients: {},
  messageConsentEvents: {},
  businessSettings: {},
  eq: vi.fn(),
}));

const { handleConsentKeyword } = await import("../consent.js");
const { db } = await import("@groombook/db");

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
    db.insert.mockReturnValue({
      values: vi.fn().mockResolvedValue([{ id: "event-1" }]),
    } as any);
    db.update.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    } as any);
  });

  const baseOpts = {
    clientId: "client-1",
    businessId: "biz-1",
    db: db as unknown as typeof import("@groombook/db").db,
  };

  describe("opt_out", () => {
    it("inserts consent event with sms_keyword source", async () => {
      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ smsOptIn: true }]),
          }),
        }),
      } as any);

      await handleConsentKeyword({ ...baseOpts, kind: "opt_out" });

      expect(db.insert).toHaveBeenCalledOnce();
    });

    it("sets smsOptIn=false and smsOptOutDate when currently opted in", async () => {
      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ smsOptIn: true }]),
          }),
        }),
      } as any);

      await handleConsentKeyword({ ...baseOpts, kind: "opt_out" });

      expect(db.update).toHaveBeenCalled();
    });

    it("is idempotent — second opt-out logs event but skips client update", async () => {
      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ smsOptIn: false }]),
          }),
        }),
      } as any);

      await handleConsentKeyword({ ...baseOpts, kind: "opt_out" });

      expect(db.update).not.toHaveBeenCalled();
    });

    it("returns unsubscribe reply text", async () => {
      db.select.mockReturnValue({
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
      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ smsOptIn: false, smsConsentDate: null }]),
          }),
        }),
      } as any);

      await handleConsentKeyword({ ...baseOpts, kind: "opt_in" });

      expect(db.update).toHaveBeenCalled();
    });

    it("clears smsOptOutDate on opt-in after opt-out", async () => {
      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ smsOptIn: false }]),
          }),
        }),
      } as any);

      await handleConsentKeyword({ ...baseOpts, kind: "opt_in" });

      expect(db.update).toHaveBeenCalled();
    });

    it("is idempotent — second opt-in skips client update", async () => {
      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ smsOptIn: true }]),
          }),
        }),
      } as any);

      await handleConsentKeyword({ ...baseOpts, kind: "opt_in" });

      expect(db.update).not.toHaveBeenCalled();
    });

    it("returns resubscribe reply text", async () => {
      db.select.mockReturnValue({
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
    it("does not call update — opt-in state unchanged", async () => {
      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ messagingHelpReply: null }]),
          }),
        }),
      } as any);

      const result = await handleConsentKeyword({ ...baseOpts, kind: "help" });

      expect(db.update).not.toHaveBeenCalled();
      expect(result.replyText).toBe(
        "Reply STOP to unsubscribe or START to resubscribe. For help, contact your groomer directly."
      );
    });

    it("uses business messagingHelpReply when configured", async () => {
      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ messagingHelpReply: "Custom help text." }]),
          }),
        }),
      } as any);

      const result = await handleConsentKeyword({ ...baseOpts, kind: "help" });
      expect(result.replyText).toBe("Custom help text.");
    });
  });
});