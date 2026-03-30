import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, waitFor, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { App } from "../App";


// Mock fetch to return appropriate responses based on URL
beforeEach(() => {
  localStorage.clear();
  global.fetch = vi.fn((url: string) => {
    if (url === "/api/dev/config") {
      return Promise.resolve({
        ok: true,
        json: async () => ({ authDisabled: false }),
      } as Response);
    }
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
    return Promise.resolve({
      ok: true,
      json: async () => [],
    } as Response);
  }) as unknown as typeof fetch;
});

async function renderApp(route = "/admin") {
  let container: HTMLElement;
  await act(async () => {
    const result = render(
      <MemoryRouter initialEntries={[route]}>
        <App />
      </MemoryRouter>
    );
    container = result.container;
  });
  // Wait for the config fetch to resolve and nav to appear
  await waitFor(() => {
    expect(screen.queryByRole("navigation")).toBeInTheDocument();
  }, { timeout: 3000 });
  return container!;
}

describe("App navigation", () => {
  // Use authDisabled=true (dev mode) so nav renders without needing Better Auth useSession() mock
  beforeEach(() => {
    localStorage.setItem("dev-user", JSON.stringify({ type: "staff", id: "s1", name: "Sarah" }));
    global.fetch = vi.fn((url: string) => {
      if (url === "/api/dev/config") {
        return Promise.resolve({
          ok: true,
          json: async () => ({ authDisabled: true }),
        } as Response);
      }
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
      return Promise.resolve({ ok: true, json: async () => [] } as Response);
    }) as unknown as typeof fetch;
  });

  it("renders the Groom Book brand", async () => {
    const nav = await renderApp();
    expect(
      within(nav).getByText((_, el) => el?.tagName === "STRONG" && /Groom\s*Book/.test(el.textContent ?? ""))
    ).toBeInTheDocument();
  });

  it("renders the Book CTA button", async () => {
    const nav = await renderApp();
    expect(within(nav).getByRole("link", { name: "Book" })).toBeInTheDocument();
  });

  it("renders all primary nav links", async () => {
    const nav = await renderApp();
    const expectedLinks = [
      "Appointments",
      "Clients",
      "Services",
      "Staff",
      "Invoices",
      "Group Bookings",
      "Reports",
    ];
    expectedLinks.forEach((label) => {
      // Use queryAllByText to find matching elements within nav
      expect(within(nav).queryAllByText(label).length).toBeGreaterThan(0);
    });
  });

  it("highlights the active route link", async () => {
    const nav = await renderApp("/admin/clients");
    const clientsLink = within(nav).queryAllByText("Clients")[0];
    // Active links use fontWeight 600
    expect(clientsLink).toHaveStyle({ fontWeight: "600" });
  });

  it("renders customer portal at root", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>
    );
    // Customer portal should render at root - no admin nav present
    await waitFor(() => {
      expect(
        screen.queryByText((_, el) => el?.tagName === "STRONG" && /Groom\s*Book/.test(el.textContent ?? ""))
      ).not.toBeInTheDocument();
    });
  });
});

describe("Dev login selector", () => {
  it("redirects to /login when auth is disabled and no user selected", async () => {
    global.fetch = vi.fn((url: string) => {
      if (url === "/api/dev/config") {
        return Promise.resolve({
          ok: true,
          json: async () => ({ authDisabled: true }),
        } as Response);
      }
      if (url === "/api/dev/users") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            staff: [{ id: "s1", name: "Sarah", email: "sarah@test.com", role: "groomer" }],
            clients: [{ id: "c1", name: "Client A", email: "a@test.com", petCount: 2 }],
          }),
        } as Response);
      }
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
      if (url === "/api/auth/get-session") {
        return Promise.resolve({
          ok: true,
          json: async () => ({ user: null }),
        } as Response);
      }
      return Promise.resolve({ ok: true, json: async () => [] } as Response);
    }) as unknown as typeof fetch;

    render(
      <MemoryRouter initialEntries={["/admin"]}>
        <App />
      </MemoryRouter>
    );

    // Should redirect to login selector and show dev login UI
    await screen.findByText("Dev Login Selector");
    expect(screen.getByText("Sarah")).toBeInTheDocument();
    expect(screen.getByText("Client A")).toBeInTheDocument();
  });

  it("does not redirect when a dev user is already selected", async () => {
    localStorage.setItem("dev-user", JSON.stringify({ type: "staff", id: "s1", name: "Sarah" }));

    global.fetch = vi.fn((url: string) => {
      if (url === "/api/dev/config") {
        return Promise.resolve({
          ok: true,
          json: async () => ({ authDisabled: true }),
        } as Response);
      }
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
      return Promise.resolve({ ok: true, json: async () => [] } as Response);
    }) as unknown as typeof fetch;

    render(
      <MemoryRouter initialEntries={["/admin"]}>
        <App />
      </MemoryRouter>
    );

    // Should show admin nav, not login selector
    const nav = await screen.findByRole("navigation");
    expect(
      within(nav).getByText((_, el) => el?.tagName === "STRONG" && /Groom\s*Book/.test(el.textContent ?? ""))
    ).toBeInTheDocument();
  });
});
