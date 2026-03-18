import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { App } from "../App.js";

// Prevent fetch errors from page components loading data on mount
beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => [],
  } as unknown as Response);
});

async function renderApp(route = "/") {
  await act(async () => {
    render(
      <MemoryRouter initialEntries={[route]}>
        <App />
      </MemoryRouter>
    );
  });
  return screen.getByRole("navigation");
}

describe("App navigation", () => {
  it("renders the Groom Book brand", async () => {
    const nav = await renderApp();
    expect(within(nav).getByText("Groom Book")).toBeInTheDocument();
  });

  it("renders the Book CTA button", async () => {
    const nav = await renderApp();
    expect(within(nav).getByText("Book")).toBeInTheDocument();
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
      expect(within(nav).getByText(label)).toBeInTheDocument();
    });
  });

  it("highlights the active route link", async () => {
    const nav = await renderApp("/clients");
    const clientsLink = within(nav).getByText("Clients");
    // Active links use fontWeight 600
    expect(clientsLink).toHaveStyle({ fontWeight: "600" });
  });
});
