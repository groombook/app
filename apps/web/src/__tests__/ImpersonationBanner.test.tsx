import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ImpersonationBanner } from "../portal/ImpersonationBanner.js";
import type { ImpersonationSession } from "../portal/mockData.js";

function makeSession(overrides: Partial<ImpersonationSession> = {}): ImpersonationSession {
  const now = new Date();
  const expires = new Date(now.getTime() + 30 * 60 * 1000); // 30 min from now
  return {
    active: true,
    staffName: "Jordan",
    staffRole: "manager",
    customerName: "Sarah Mitchell",
    reason: "Customer requested help",
    startedAt: now.toISOString(),
    expiresAt: expires.toISOString(),
    extended: false,
    readOnly: true,
    auditLog: [],
    ...overrides,
  };
}

describe("ImpersonationBanner", () => {
  const onEnd = vi.fn();
  const onExtend = vi.fn();
  const onShowAudit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders banner when session is active", () => {
    render(
      <ImpersonationBanner
        session={makeSession()}
        onEnd={onEnd}
        onExtend={onExtend}
        onShowAudit={onShowAudit}
      />
    );
    expect(screen.getByText(/STAFF VIEW/)).toBeInTheDocument();
  });

  it("shows the customer name", () => {
    render(
      <ImpersonationBanner
        session={makeSession()}
        onEnd={onEnd}
        onExtend={onExtend}
        onShowAudit={onShowAudit}
      />
    );
    expect(screen.getByText("Sarah Mitchell")).toBeInTheDocument();
  });

  it("returns null when session is not active", () => {
    const { container } = render(
      <ImpersonationBanner
        session={makeSession({ active: false })}
        onEnd={onEnd}
        onExtend={onExtend}
        onShowAudit={onShowAudit}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("calls onEnd when End Session is clicked", () => {
    render(
      <ImpersonationBanner
        session={makeSession()}
        onEnd={onEnd}
        onExtend={onExtend}
        onShowAudit={onShowAudit}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /end session/i }));
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("calls onShowAudit when Audit is clicked", () => {
    render(
      <ImpersonationBanner
        session={makeSession()}
        onEnd={onEnd}
        onExtend={onExtend}
        onShowAudit={onShowAudit}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /audit/i }));
    expect(onShowAudit).toHaveBeenCalledTimes(1);
  });

  it("calls onEnd automatically when session expires", async () => {
    const expiredSoon = new Date(Date.now() + 500);
    const session = makeSession({ expiresAt: expiredSoon.toISOString() });

    render(
      <ImpersonationBanner
        session={session}
        onEnd={onEnd}
        onExtend={onExtend}
        onShowAudit={onShowAudit}
      />
    );

    // Advance past expiry
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(onEnd).toHaveBeenCalled();
  });

  it("shows Extend button when warning is active and session not yet extended", () => {
    // Set expiry to 3 min from now — within warning threshold (< 5 min)
    const expiresAt = new Date(Date.now() + 3 * 60 * 1000).toISOString();
    render(
      <ImpersonationBanner
        session={makeSession({ expiresAt, extended: false })}
        onEnd={onEnd}
        onExtend={onExtend}
        onShowAudit={onShowAudit}
      />
    );
    // Tick the timer once to trigger showWarning
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByRole("button", { name: /extend/i })).toBeInTheDocument();
  });

  it("does not show Extend button when already extended", () => {
    const expiresAt = new Date(Date.now() + 3 * 60 * 1000).toISOString();
    render(
      <ImpersonationBanner
        session={makeSession({ expiresAt, extended: true })}
        onEnd={onEnd}
        onExtend={onExtend}
        onShowAudit={onShowAudit}
      />
    );
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.queryByRole("button", { name: /extend/i })).not.toBeInTheDocument();
  });
});
