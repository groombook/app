import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { GlobalSearch } from "../components/GlobalSearch.js";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

function renderSearch() {
  return render(
    <MemoryRouter>
      <GlobalSearch />
    </MemoryRouter>
  );
}

beforeEach(() => {
  mockNavigate.mockReset();
  global.fetch = vi.fn();
});

describe("GlobalSearch", () => {
  it("renders the search input with correct aria attributes", () => {
    renderSearch();
    const input = screen.getByRole("combobox");
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute("aria-label", "Search clients and pets");
    expect(input).toHaveAttribute("placeholder", "Search clients & pets…");
  });

  it("does not fetch when query is empty or whitespace", async () => {
    renderSearch();
    const user = userEvent.setup({ delay: null });
    const input = screen.getByRole("combobox");
    await user.type(input, "   ");
    // No debounce fires for blank input — verify fetch was never called
    await new Promise((r) => setTimeout(r, 350));
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("fetches after debounce and renders client results", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        clients: [{ id: "c1", name: "Alice Johnson", email: "alice@example.com", phone: "555-1234" }],
        pets: [],
      }),
    } as Response);

    renderSearch();
    const user = userEvent.setup({ delay: null });
    await user.type(screen.getByRole("combobox"), "Alice");

    await waitFor(() => expect(screen.getByText("Alice Johnson")).toBeInTheDocument(), {
      timeout: 1500,
    });
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining("/api/search?q=Alice"));
    // Section header should appear
    expect(screen.getByText("Clients")).toBeInTheDocument();
  });

  it("fetches after debounce and renders pet results with owner name", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        clients: [],
        pets: [
          { id: "p1", name: "Bella", breed: "Golden Retriever", clientId: "c1", ownerName: "Alice Johnson" },
        ],
      }),
    } as Response);

    renderSearch();
    const user = userEvent.setup({ delay: null });
    await user.type(screen.getByRole("combobox"), "Bella");

    await waitFor(() => expect(screen.getByText("Bella")).toBeInTheDocument(), { timeout: 1500 });
    expect(screen.getByText("Owner: Alice Johnson")).toBeInTheDocument();
  });

  it("shows 'No results found' for a query that matches nothing", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ clients: [], pets: [] }),
    } as Response);

    renderSearch();
    const user = userEvent.setup({ delay: null });
    await user.type(screen.getByRole("combobox"), "xyzzy");

    await waitFor(() => expect(screen.getByText("No results found")).toBeInTheDocument(), {
      timeout: 1500,
    });
  });

  it("navigates to ?highlight=<id> and clears input when a client result is clicked", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        clients: [{ id: "c1", name: "Alice Johnson", email: null, phone: null }],
        pets: [],
      }),
    } as Response);

    renderSearch();
    const user = userEvent.setup({ delay: null });
    const input = screen.getByRole("combobox");
    await user.type(input, "Alice");

    await waitFor(() => screen.getByText("Alice Johnson"), { timeout: 1500 });
    await user.click(screen.getByText("Alice Johnson"));

    expect(mockNavigate).toHaveBeenCalledWith("/admin/clients?highlight=c1");
    expect(input).toHaveValue("");
  });

  it("navigates to owner client ?highlight=<clientId> when a pet result is clicked", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        clients: [],
        pets: [{ id: "p1", name: "Bella", breed: null, clientId: "c1", ownerName: "Alice" }],
      }),
    } as Response);

    renderSearch();
    const user = userEvent.setup({ delay: null });
    const input = screen.getByRole("combobox");
    await user.type(input, "Bella");

    await waitFor(() => screen.getByText("Bella"), { timeout: 1500 });
    await user.click(screen.getByText("Bella"));

    expect(mockNavigate).toHaveBeenCalledWith("/admin/clients?highlight=c1");
    expect(input).toHaveValue("");
  });
});
