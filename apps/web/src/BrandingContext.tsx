import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";

export interface Branding {
  businessName: string;
  primaryColor: string;
  accentColor: string;
  logoBase64: string | null;
  logoMimeType: string | null;
}

const DEFAULT_BRANDING: Branding = {
  businessName: "GroomBook",
  primaryColor: "#4f8a6f",
  accentColor: "#8b7355",
  logoBase64: null,
  logoMimeType: null,
};

const BrandingContext = createContext<{
  branding: Branding;
  refresh: () => void;
}>({ branding: DEFAULT_BRANDING, refresh: () => {} });

export function useBranding() {
  return useContext(BrandingContext);
}

export function BrandingProvider({ children }: { children: React.ReactNode }) {
  const [branding, setBranding] = useState<Branding>(DEFAULT_BRANDING);
  const metaThemeColorRef = useRef<HTMLMetaElement | null>(null);

  const fetchBranding = useCallback(() => {
    fetch("/api/branding")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && typeof data.businessName === "string") setBranding(data);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchBranding();
  }, [fetchBranding]);

  // Apply CSS custom properties whenever branding changes
  useEffect(() => {
    document.documentElement.style.setProperty("--color-primary", branding.primaryColor);
    document.documentElement.style.setProperty("--color-accent", branding.accentColor);
    // Keep PWA theme-color meta tag in sync with primary color
    if (!metaThemeColorRef.current) {
      metaThemeColorRef.current = document.querySelector<HTMLMetaElement>("meta[name='theme-color']");
      if (!metaThemeColorRef.current) {
        metaThemeColorRef.current = document.createElement("meta");
        metaThemeColorRef.current.name = "theme-color";
        document.head.appendChild(metaThemeColorRef.current);
      }
    }
    metaThemeColorRef.current.content = branding.primaryColor;
  }, [branding.primaryColor, branding.accentColor]);

  return (
    <BrandingContext.Provider value={{ branding, refresh: fetchBranding }}>
      {children}
    </BrandingContext.Provider>
  );
}
