import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ImpersonationBanner } from "../portal/ImpersonationBanner.js";
import { AuditLogViewer } from "../portal/AuditLogViewer.js";
import type { ImpersonationSession, ImpersonationAuditLog } from "@groombook/types";

const SESSION: ImpersonationSession = {
  id: "sess-1",
  staffId: "staff-1",
  clientId: "client-1",
  reason: "Customer reported missing appointment",
  status: "active",
  startedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  endedAt: null,
  expiresAt: new Date(Date.now() + 25 * 60_000).toISOString(),
  createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
};

const AUDIT_LOGS: ImpersonationAuditLog[] = [
  {
    id: "log-1",
    sessionId: "sess-1",
    action: "session_started",
    pageVisited: null,
    metadata: { reason: "Customer reported missing appointment" },
    createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  },
  {
    id: "log-2",
    sessionId: "sess-1",
    action: "page_view",
    pageVisited: "appointments",
    metadata: null,
    createdAt: new Date(Date.now() - 3 * 60_000).toISOString(),
  },
];

// ─── ImpersonationBanner ────────────────────────────────────────────────────

describe("ImpersonationBanner", () => {
  it("renders STAFF VIEW label", () => {
    render(
      <ImpersonationBanner
        session={SESSION}
        isExtended={false}
        onEnd={vi.fn()}
        onExtend={vi.fn()}
        onShowAudit={vi.fn()}
      />
    );
    expect(screen.getByText("STAFF VIEW")).toBeInTheDocument();
  });

  it("displays the session reason", () => {
    render(
      <ImpersonationBanner
        session={SESSION}
        isExtended={false}
        onEnd={vi.fn()}
        onExtend={vi.fn()}
        onShowAudit={vi.fn()}
      />
    );
    expect(screen.getByText(/Customer reported missing appointment/)).toBeInTheDocument();
  });

  it("calls onEnd when End Session is clicked", () => {
    const onEnd = vi.fn();
    render(
      <ImpersonationBanner
        session={SESSION}
        isExtended={false}
        onEnd={onEnd}
        onExtend={vi.fn()}
        onShowAudit={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /End Session/i }));
    expect(onEnd).toHaveBeenCalledOnce();
  });

  it("calls onShowAudit when Audit is clicked", () => {
    const onShowAudit = vi.fn();
    render(
      <ImpersonationBanner
        session={SESSION}
        isExtended={false}
        onEnd={vi.fn()}
        onExtend={vi.fn()}
        onShowAudit={onShowAudit}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Audit/i }));
    expect(onShowAudit).toHaveBeenCalledOnce();
  });

  it("shows Extend button when less than 5 minutes remain and not yet extended", async () => {
    const nearlyExpiredSession: ImpersonationSession = {
      ...SESSION,
      expiresAt: new Date(Date.now() + 3 * 60_000).toISOString(), // 3 min left
    };
    render(
      <ImpersonationBanner
        session={nearlyExpiredSession}
        isExtended={false}
        onEnd={vi.fn()}
        onExtend={vi.fn()}
        onShowAudit={vi.fn()}
      />
    );
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Extend/i })).toBeInTheDocument();
    });
  });

  it("does not show Extend button when already extended", async () => {
    const nearlyExpiredSession: ImpersonationSession = {
      ...SESSION,
      expiresAt: new Date(Date.now() + 3 * 60_000).toISOString(),
    };
    render(
      <ImpersonationBanner
        session={nearlyExpiredSession}
        isExtended={true}
        onEnd={vi.fn()}
        onExtend={vi.fn()}
        onShowAudit={vi.fn()}
      />
    );
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /Extend/i })).not.toBeInTheDocument();
    });
  });
});

// ─── AuditLogViewer ─────────────────────────────────────────────────────────

describe("AuditLogViewer", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it("fetches and displays audit log entries", async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => [...AUDIT_LOGS].reverse(), // API returns newest-first
    } as Response);

    render(<AuditLogViewer sessionId="sess-1" onClose={vi.fn()} />);

    await waitFor(() => {
      // "session started" appears in both the filter dropdown option and the log entry span
      expect(screen.getAllByText("session started").length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.getByText("appointments")).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith("/api/impersonation/sessions/sess-1/audit-log");
  });

  it("shows error state when fetch fails", async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 403,
    } as Response);

    render(<AuditLogViewer sessionId="sess-1" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/Failed to load audit log/i)).toBeInTheDocument();
    });
  });

  it("shows loading state initially", () => {
    vi.mocked(global.fetch).mockReturnValue(new Promise(() => {}));

    render(<AuditLogViewer sessionId="sess-1" onClose={vi.fn()} />);

    expect(screen.getByText(/Loading audit log/i)).toBeInTheDocument();
  });

  it("calls onClose when X button is clicked", async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => [],
    } as Response);

    const onClose = vi.fn();
    render(<AuditLogViewer sessionId="sess-1" onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText(/No audit entries/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("filters entries by action type", async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => [...AUDIT_LOGS].reverse(),
    } as Response);

    render(<AuditLogViewer sessionId="sess-1" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getAllByText("session started").length).toBeGreaterThanOrEqual(1);
    });

    // Filter to page_view only
    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "page_view" } });

    expect(screen.getByText("appointments")).toBeInTheDocument();
    // After filtering, the "session started" span (log entry) should be gone
    // The option in the select still has the text but the log entry span does not
    const spans = document.querySelectorAll("span.inline-block");
    expect(Array.from(spans).every((s) => s.textContent !== "session started")).toBe(true);
  });
});

// ─── CustomerPortal — session loading ──────────────────────────────────────

describe("CustomerPortal session loading", () => {
  beforeEach(() => {
    global.fetch = vi.fn((url: string) => {
      if (url === "/api/branding") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            businessName: "GroomBook",
            primaryColor: "#4f8a6f",
            accentColor: "#8b7355",
            logoBase64: null,
            logoMimeType: null,
          }),
        } as Response);
      }
      if (url.startsWith("/api/impersonation/sessions/")) {
        return Promise.resolve({
          ok: true,
          json: async () => SESSION,
        } as Response);
      }
      return Promise.resolve({ ok: true, json: async () => [] } as Response);
    }) as unknown as typeof fetch;
  });

  it("loads and displays impersonation banner when sessionId is in URL", async () => {
    const { CustomerPortal } = await import("../portal/CustomerPortal.js");
    render(
      <MemoryRouter initialEntries={["/?sessionId=sess-1"]}>
        <CustomerPortal />
      </MemoryRouter>
    );

    // Wait for the session fetch and banner to appear
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/impersonation/sessions/sess-1");
    });
    // Banner "End Session" button is unique to the active impersonation banner
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /End Session/i })).toBeInTheDocument();
    });
  });

  it("does not show banner when no sessionId in URL", async () => {
    vi.mocked(global.fetch).mockClear();
    const { CustomerPortal } = await import("../portal/CustomerPortal.js");
    render(
      <MemoryRouter initialEntries={["/"]}>
        <CustomerPortal />
      </MemoryRouter>
    );

    // No impersonation session fetch should happen
    await new Promise((r) => setTimeout(r, 50));
    const impersonationFetches = vi.mocked(global.fetch).mock.calls.filter(
      ([url]) => typeof url === "string" && url.startsWith("/api/impersonation/")
    );
    expect(impersonationFetches).toHaveLength(0);
    expect(screen.queryByRole("button", { name: /End Session/i })).not.toBeInTheDocument();
  });

  it("redirects to /admin/clients after ending impersonation session", async () => {
    // Mock window.location.href
    const originalLocation = window.location;
    Object.defineProperty(window, "location", {
      value: { href: "" },
      writable: true,
    });

    const { CustomerPortal } = await import("../portal/CustomerPortal.js");
    render(
      <MemoryRouter initialEntries={["/?sessionId=sess-1"]}>
        <CustomerPortal />
      </MemoryRouter>
    );

    // Wait for banner to appear
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /End Session/i })).toBeInTheDocument();
    });

    // Click "End Session" — this triggers handleEnd which calls the API then redirects
    fireEvent.click(screen.getByRole("button", { name: /End Session/i }));

    await waitFor(() => {
      expect(window.location.href).toBe("/admin/clients");
    });

    // Restore
    Object.defineProperty(window, "location", { value: originalLocation, writable: true });
  });
});
