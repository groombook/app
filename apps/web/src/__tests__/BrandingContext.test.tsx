import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { BrandingProvider, useBranding } from "../BrandingContext.js";

function BrandingConsumer() {
  const { branding } = useBranding();
  return (
    <div data-testid="branding">
      <span data-testid="primary">{branding.primaryColor}</span>
      <span data-testid="accent">{branding.accentColor}</span>
    </div>
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  document.documentElement.style.removeProperty("--color-primary");
  document.documentElement.style.removeProperty("--color-accent");
  // Remove any theme-color meta tags
  document.querySelectorAll("meta[name='theme-color']").forEach((el) => el.remove());
});

describe("BrandingProvider", () => {
  it("applies CSS vars to document root when branding loads", async () => {
    const branding = {
      businessName: "Test Salon",
      primaryColor: "#123456",
      accentColor: "#654321",
      logoBase64: null,
      logoMimeType: null,
    };
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: async () => branding } as Response)
    ) as unknown as typeof fetch;

    render(
      <BrandingProvider>
        <BrandingConsumer />
      </BrandingProvider>
    );

    await waitFor(() => {
      expect(document.documentElement.style.getPropertyValue("--color-primary")).toBe("#123456");
      expect(document.documentElement.style.getPropertyValue("--color-accent")).toBe("#654321");
    });
  });

  it("creates and updates meta[name=theme-color]", async () => {
    const branding = {
      businessName: "Test Salon",
      primaryColor: "#abcdef",
      accentColor: "#fedcba",
      logoBase64: null,
      logoMimeType: null,
    };
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: async () => branding } as Response)
    ) as unknown as typeof fetch;

    render(
      <BrandingProvider>
        <BrandingConsumer />
      </BrandingProvider>
    );

    await waitFor(() => {
      const meta = document.querySelector<HTMLMetaElement>("meta[name='theme-color']");
      expect(meta).not.toBeNull();
      expect(meta!.content).toBe("#abcdef");
    });
  });

  it("does not create duplicate meta[name=theme-color] tags on rerender", async () => {
    const branding = {
      businessName: "Test Salon",
      primaryColor: "#111111",
      accentColor: "#222222",
      logoBase64: null,
      logoMimeType: null,
    };
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: async () => branding } as Response)
    ) as unknown as typeof fetch;

    const { rerender } = render(
      <BrandingProvider>
        <BrandingConsumer />
      </BrandingProvider>
    );

    await waitFor(() => {
      expect(document.querySelector("meta[name='theme-color']")).not.toBeNull();
    });

    rerender(
      <BrandingProvider>
        <BrandingConsumer />
      </BrandingProvider>
    );

    await waitFor(() => {
      const metas = document.querySelectorAll("meta[name='theme-color']");
      expect(metas.length).toBe(1);
    });
  });
});
