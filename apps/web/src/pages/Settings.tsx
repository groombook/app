import { useState, useEffect, useRef } from "react";
import { useBranding } from "../BrandingContext.js";

interface SettingsForm {
  businessName: string;
  primaryColor: string;
  accentColor: string;
  logoKey: string | null;
  logoUrl: string | null;
  logoBase64: string | null; // legacy
  logoMimeType: string | null; // legacy
}

export function SettingsPage() {
  const { refresh } = useBranding();
  const [form, setForm] = useState<SettingsForm>({
    businessName: "",
    primaryColor: "#4f8a6f",
    accentColor: "#8b7355",
    logoKey: null,
    logoUrl: null,
    logoBase64: null,
    logoMimeType: null,
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then(async (data) => {
        let logoUrl: string | null = null;
        if (data.logoKey) {
          try {
            const logoRes = await fetch("/api/admin/settings/logo");
            if (logoRes.ok) {
              const logoData = await logoRes.json();
              logoUrl = logoData.url;
            }
          } catch {
            // ignore
          }
        }
        setForm({
          businessName: data.businessName ?? "GroomBook",
          primaryColor: data.primaryColor ?? "#4f8a6f",
          accentColor: data.accentColor ?? "#8b7355",
          logoKey: data.logoKey ?? null,
          logoUrl,
          logoBase64: data.logoBase64 ?? null,
          logoMimeType: data.logoMimeType ?? null,
        });
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 512 * 1024) {
      setMessage({ type: "error", text: "Logo must be under 512KB." });
      return;
    }

    const validTypes = ["image/png", "image/svg+xml", "image/jpeg", "image/webp"];
    if (!validTypes.includes(file.type)) {
      setMessage({ type: "error", text: "Logo must be PNG, SVG, JPEG, or WebP." });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the data:...;base64, prefix
      const base64 = result.split(",")[1] ?? null;
      setForm((f) => ({ ...f, logoBase64: base64, logoMimeType: file.type as SettingsForm["logoMimeType"] }));
      setMessage(null);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "Failed to save settings");
      }
      setMessage({ type: "success", text: "Settings saved." });
      refresh();
    } catch (err: unknown) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Save failed" });
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) return <p>Loading settings...</p>;

  const logoSrc = form.logoBase64 && form.logoMimeType
    ? `data:${form.logoMimeType};base64,${form.logoBase64}`
    : null;

  return (
    <div style={{ maxWidth: 600 }}>
      <h1>Branding & Appearance</h1>
      <p style={{ color: "#6b7280", marginBottom: "1.5rem" }}>
        Customize your business name, logo, and color scheme.
      </p>

      {/* Business Name */}
      <div style={{ marginBottom: "1.25rem" }}>
        <label style={{ display: "block", fontWeight: 600, marginBottom: 4 }}>
          Business Name
        </label>
        <input
          type="text"
          value={form.businessName}
          onChange={(e) => setForm((f) => ({ ...f, businessName: e.target.value }))}
          style={{
            width: "100%",
            padding: "0.5rem 0.75rem",
            border: "1px solid #d1d5db",
            borderRadius: 6,
            fontSize: 14,
          }}
        />
      </div>

      {/* Logo Upload */}
      <div style={{ marginBottom: "1.25rem" }}>
        <label style={{ display: "block", fontWeight: 600, marginBottom: 4 }}>
          Logo
        </label>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          {logoSrc ? (
            <img
              src={logoSrc}
              alt="Logo preview"
              style={{ width: 64, height: 64, objectFit: "contain", borderRadius: 8, border: "1px solid #e5e7eb" }}
            />
          ) : (
            <div style={{
              width: 64, height: 64, borderRadius: 8,
              border: "2px dashed #d1d5db", display: "flex",
              alignItems: "center", justifyContent: "center",
              color: "#9ca3af", fontSize: 12,
            }}>
              No logo
            </div>
          )}
          <div>
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                padding: "0.4rem 0.75rem",
                border: "1px solid #d1d5db",
                borderRadius: 6,
                background: "#fff",
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              Upload Logo
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/svg+xml,image/jpeg,image/webp"
              onChange={handleLogoChange}
              style={{ display: "none" }}
            />
            {logoSrc && (
              <button
                onClick={() => setForm((f) => ({ ...f, logoBase64: null, logoMimeType: null }))}
                style={{
                  marginLeft: 8,
                  padding: "0.4rem 0.75rem",
                  border: "1px solid #fca5a5",
                  borderRadius: 6,
                  background: "#fff",
                  color: "#dc2626",
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                Remove
              </button>
            )}
            <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 4 }}>
              PNG, SVG, JPEG, or WebP. Max 512KB.
            </p>
          </div>
        </div>
      </div>

      {/* Color Pickers */}
      <div style={{ display: "flex", gap: "1.5rem", marginBottom: "1.5rem" }}>
        <div>
          <label style={{ display: "block", fontWeight: 600, marginBottom: 4 }}>
            Primary Color
          </label>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="color"
              value={form.primaryColor}
              onChange={(e) => setForm((f) => ({ ...f, primaryColor: e.target.value }))}
              style={{ width: 40, height: 40, border: "none", cursor: "pointer" }}
            />
            <input
              type="text"
              value={form.primaryColor}
              onChange={(e) => setForm((f) => ({ ...f, primaryColor: e.target.value }))}
              style={{
                width: 90,
                padding: "0.4rem 0.5rem",
                border: "1px solid #d1d5db",
                borderRadius: 6,
                fontSize: 13,
                fontFamily: "monospace",
              }}
            />
          </div>
        </div>
        <div>
          <label style={{ display: "block", fontWeight: 600, marginBottom: 4 }}>
            Accent Color
          </label>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="color"
              value={form.accentColor}
              onChange={(e) => setForm((f) => ({ ...f, accentColor: e.target.value }))}
              style={{ width: 40, height: 40, border: "none", cursor: "pointer" }}
            />
            <input
              type="text"
              value={form.accentColor}
              onChange={(e) => setForm((f) => ({ ...f, accentColor: e.target.value }))}
              style={{
                width: 90,
                padding: "0.4rem 0.5rem",
                border: "1px solid #d1d5db",
                borderRadius: 6,
                fontSize: 13,
                fontFamily: "monospace",
              }}
            />
          </div>
        </div>
      </div>

      {/* Preview */}
      <div style={{
        padding: "1rem",
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        marginBottom: "1.5rem",
        background: "#fafafa",
      }}>
        <p style={{ fontWeight: 600, marginBottom: 8, fontSize: 13, color: "#6b7280" }}>Preview</p>
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "0.5rem 1rem",
          background: "#fff",
          borderRadius: 6,
          border: "1px solid #e5e7eb",
        }}>
          {logoSrc && (
            <img src={logoSrc} alt="" style={{ width: 28, height: 28, objectFit: "contain" }} />
          )}
          <strong style={{ color: form.primaryColor }}>{form.businessName}</strong>
          <span style={{
            marginLeft: "auto",
            padding: "0.25rem 0.75rem",
            borderRadius: 4,
            color: "#fff",
            background: form.primaryColor,
            fontSize: 13,
          }}>
            Button
          </span>
          <span style={{
            padding: "0.25rem 0.75rem",
            borderRadius: 4,
            color: "#fff",
            background: form.accentColor,
            fontSize: 13,
          }}>
            Accent
          </span>
        </div>
      </div>

      {/* Save */}
      {message && (
        <div style={{
          padding: "0.5rem 0.75rem",
          borderRadius: 6,
          marginBottom: "1rem",
          fontSize: 14,
          background: message.type === "success" ? "#ecfdf5" : "#fef2f2",
          color: message.type === "success" ? "#065f46" : "#991b1b",
          border: `1px solid ${message.type === "success" ? "#a7f3d0" : "#fecaca"}`,
        }}>
          {message.text}
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={saving || !form.businessName.trim()}
        style={{
          padding: "0.5rem 1.5rem",
          borderRadius: 6,
          border: "none",
          background: form.primaryColor,
          color: "#fff",
          fontWeight: 600,
          fontSize: 14,
          cursor: saving ? "wait" : "pointer",
          opacity: saving ? 0.7 : 1,
        }}
      >
        {saving ? "Saving..." : "Save Changes"}
      </button>
    </div>
  );
}
