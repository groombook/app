import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { PetPhotoDisplay } from "../components/PetPhotoDisplay.js";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("PetPhotoDisplay", () => {
  it("shows loading skeleton while fetching", () => {
    global.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch;

    render(<PetPhotoDisplay petId="pet-1" />);

    expect(screen.getByLabelText("Loading photo…")).toBeInTheDocument();
  });

  it("renders photo img when fetch returns a URL", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ url: "https://storage.test/pet-1/photo.jpg" }),
      } as Response)
    ) as unknown as typeof fetch;

    render(<PetPhotoDisplay petId="pet-1" />);

    const img = await screen.findByRole("img", { name: "Pet photo" });
    expect(img).toHaveAttribute("src", "https://storage.test/pet-1/photo.jpg");
  });

  it("shows paw placeholder when API returns 404", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: false, status: 404 } as Response)
    ) as unknown as typeof fetch;

    render(<PetPhotoDisplay petId="pet-1" />);

    await waitFor(() => {
      expect(screen.getByLabelText("No photo")).toBeInTheDocument();
    });
    expect(screen.queryByLabelText("Loading photo…")).not.toBeInTheDocument();
  });

  it("shows paw placeholder when fetch rejects (network error)", async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error("network error"))) as unknown as typeof fetch;

    render(<PetPhotoDisplay petId="pet-1" />);

    await waitFor(() => {
      expect(screen.getByLabelText("No photo")).toBeInTheDocument();
    });
  });

  it("shows paw placeholder on non-404 error status", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: false, status: 500 } as Response)
    ) as unknown as typeof fetch;

    render(<PetPhotoDisplay petId="pet-1" />);

    await waitFor(() => {
      expect(screen.getByLabelText("No photo")).toBeInTheDocument();
    });
  });

  it("refetches when petId changes", async () => {
    const fetchMock = vi.fn((url: string) => {
      const petId = (url as string).match(/\/api\/pets\/([^/]+)\/photo/)?.[1];
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ url: `https://storage.test/${petId}/photo.jpg` }),
      } as Response);
    }) as unknown as typeof fetch;
    global.fetch = fetchMock;

    const { rerender } = render(<PetPhotoDisplay petId="pet-1" />);
    await screen.findByRole("img");
    expect(fetchMock).toHaveBeenCalledWith("/api/pets/pet-1/photo");

    rerender(<PetPhotoDisplay petId="pet-2" />);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/pets/pet-2/photo");
    });
  });

  it("applies custom size prop to container", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: false, status: 404 } as Response)
    ) as unknown as typeof fetch;

    const { container } = render(<PetPhotoDisplay petId="pet-1" size={96} />);

    await screen.findByLabelText("No photo");
    const div = container.firstChild as HTMLElement;
    expect(div).toHaveStyle({ width: "96px", height: "96px" });
  });
});
