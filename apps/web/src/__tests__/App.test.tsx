import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { App } from "../App.js";

// Prevent fetch errors from page components loading data on mount
beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => [],
  } as unknown as Response);
});

function renderApp(route = "/admin") {
  render(
    <MemoryRouter initialEntries={[route]}>
      <App />
    </MemoryRouter>
  );
  return screen.getByRole("navigation");
}

describe("App navigation", () => {
  it("renders the Groom Book brand", () => {
    const nav = renderApp();
    expect(within(nav).getByText("Groom Book")).toBeInTheDocument();
  });

  it("renders the Book CTA button", () => {
    const nav = renderApp();
    expect(within(nav).getByText("Book")).toBeInTheDocument();
  });

  it("renders all primary nav links", () => {
    const nav = renderApp();
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
      expect(within(nav).getByText(label)).toBeInTheDocument();
    });
  });

  it("highlights the active route link", () => {
    const nav = renderApp("/admin/clients");
    const clientsLink = within(nav).getByText("Clients");
    // Active links use fontWeight 600
    expect(clientsLink).toHaveStyle({ fontWeight: "600" });
  });

  it("renders customer portal at root", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>
    );
    // Customer portal should render at root - no admin nav present
    expect(screen.queryByText("Groom Book")).not.toBeInTheDocument();
  });
});
