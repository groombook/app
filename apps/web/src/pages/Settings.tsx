import { useState, useEffect, useRef } from "react";
import { useBranding } from "../BrandingContext.js";

interface AuthProviderConfig {
  id: number;
  providerId: string;
  displayName: string;
  issuerUrl: string;
  internalBaseUrl: string | null;
  clientId: string;
  clientSecret: string;
  scopes: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

interface AuthProviderForm {
  providerId: string;
  displayName: string;
  issuerUrl: string;
  internalBaseUrl: string;
  clientId: string;
  clientSecret: string;
  scopes: string;
}

const REDACTED = "••••••••";

const ALLOWED_LOGO_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: string;
  isSuperUser: boolean;
}

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
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);

  // Auth provider state
  const [authConfig, setAuthConfig] = useState<AuthProviderConfig | null>(null);
  const [authForm, setAuthForm] = useState<AuthProviderForm>({
    providerId: "authentik",
    displayName: "",
    issuerUrl: "",
    internalBaseUrl: "",
    clientId: "",
    clientSecret: "",
    scopes: "openid profile email",
  });
  const [authSecretTouched, setAuthSecretTouched] = useState(false);
  const [authLoaded, setAuthLoaded] = useState(false);
  const [authSaving, setAuthSaving] = useState(false);
  const [authMessage, setAuthMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);
  const [showInternalBaseUrl, setShowInternalBaseUrl] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

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

  // Load current user (for isSuperUser check) and auth provider config
  useEffect(() => {
    Promise.all([
      fetch("/api/staff/me").then((r) => r.json()).catch(() => null),
      fetch("/api/admin/auth-provider").then(async (r) => {
        if (r.ok) return r.json();
        if (r.status === 404) return null;
        throw new Error(`HTTP ${r.status}`);
      }).catch(() => null),
    ]).then(([user, auth]) => {
      setCurrentUser(user as CurrentUser | null);
      if (auth) {
        setAuthConfig(auth as AuthProviderConfig);
        setAuthForm({
          providerId: (auth as AuthProviderConfig).providerId,
          displayName: (auth as AuthProviderConfig).displayName,
          issuerUrl: (auth as AuthProviderConfig).issuerUrl,
          internalBaseUrl: (auth as AuthProviderConfig).internalBaseUrl ?? "",
          clientId: (auth as AuthProviderConfig).clientId,
          clientSecret: (auth as AuthProviderConfig).clientSecret,
          scopes: (auth as AuthProviderConfig).scopes,
        });
      }
      setAuthLoaded(true);
    });
  }, []);

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 512 * 1024) {
      setMessage({ type: "error", text: "Logo must be under 512KB." });
      return;
    }

    const validTypes = ["image/png", "image/jpeg", "image/gif", "image/webp"];
    if (!validTypes.includes(file.type)) {
      setMessage({ type: "error", text: "Logo must be PNG, JPEG, GIF, or WebP." });
      return;
    }

    try {
      // Upload directly through the API server to avoid mixed-content issues
      // with pre-signed URLs that use the internal HTTP endpoint
      const formData = new FormData();
      formData.append("file", file);

      const uploadRes = await fetch("/api/admin/settings/logo/upload", {
        method: "POST",
        body: formData,
      });
      if (!uploadRes.ok) {
        const err = await uploadRes.json().catch(() => null);
        throw new Error(err?.error ?? "Failed to upload logo");
      }
      const { logoKey } = await uploadRes.json();

      // Fetch the presigned GET URL for display
      const logoRes = await fetch("/api/admin/settings/logo");
      if (logoRes.ok) {
        const logoData = await logoRes.json();
        setForm((f) => ({ ...f, logoKey, logoUrl: logoData.url, logoBase64: null, logoMimeType: null }));
      } else {
        setForm((f) => ({ ...f, logoKey, logoUrl: null, logoBase64: null, logoMimeType: null }));
      }
      setMessage({ type: "success", text: "Logo uploaded." });
      refresh();
    } catch (err: unknown) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Logo upload failed" });
    }
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

  // Auth provider handlers
  const handleTestConnection = async () => {
    setTestingConnection(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/admin/auth-provider/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
issuerUrl: authForm.issuerUrl,
          ...(authForm.internalBaseUrl ? { internalBaseUrl: authForm.internalBaseUrl } : {}),
        }),
      });
      const data = await res.json();
      setTestResult(data);
    } catch {
      setTestResult({ ok: false, error: "Network error. Please try again." });
    } finally {
      setTestingConnection(false);
    }
  };

  const handleAuthSave = async () => {
    setAuthSaving(true);
    setAuthMessage(null);
    try {
      const payload: Record<string, string> = {
        providerId: authForm.providerId,
        displayName: authForm.displayName,
        issuerUrl: authForm.issuerUrl,
        clientId: authForm.clientId,
        scopes: authForm.scopes,
      };
      if (authForm.internalBaseUrl) {
        payload.internalBaseUrl = authForm.internalBaseUrl;
      }
      // Only send clientSecret if user changed it from the redacted value
      if (authSecretTouched) {
        payload.clientSecret = authForm.clientSecret;
      }
      const res = await fetch("/api/admin/auth-provider", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "Failed to save auth provider");
      }
      const saved = await res.json() as AuthProviderConfig;
      setAuthConfig(saved);
      setAuthForm({
        providerId: saved.providerId,
        displayName: saved.displayName,
        issuerUrl: saved.issuerUrl,
        internalBaseUrl: saved.internalBaseUrl ?? "",
        clientId: saved.clientId,
        clientSecret: saved.clientSecret,
        scopes: saved.scopes,
      });
      setAuthSecretTouched(false);
      setAuthMessage({ type: "success", text: "Auth provider saved." });
    } catch (err: unknown) {
      setAuthMessage({ type: "error", text: err instanceof Error ? err.message : "Save failed" });
    } finally {
      setAuthSaving(false);
    }
  };

  const handleResetToEnvDefaults = async () => {
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    setConfirmReset(false);
    try {
      const res = await fetch("/api/admin/auth-provider", { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "Failed to reset auth provider");
      }
      setAuthConfig(null);
      setAuthForm({
        providerId: "authentik",
        displayName: "",
        issuerUrl: "",
        internalBaseUrl: "",
        clientId: "",
        clientSecret: "",
        scopes: "openid profile email",
      });
      setAuthSecretTouched(false);
      setAuthMessage({ type: "success", text: "Auth provider reset to environment defaults." });
    } catch (err: unknown) {
      setAuthMessage({ type: "error", text: err instanceof Error ? err.message : "Reset failed" });
    }
  };

  if (!loaded) return <p>Loading settings...</p>;

  const logoSrc = form.logoUrl ?? (form.logoBase64 && form.logoMimeType && ALLOWED_LOGO_TYPES.has(form.logoMimeType) ? `data:${form.logoMimeType};base64,${form.logoBase64}` : null);

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
              accept="image/png,image/jpeg,image/gif,image/webp"
              onChange={handleLogoChange}
              style={{ display: "none" }}
            />
            {logoSrc && (
              <button
                onClick={async () => {
                  try {
                    const res = await fetch("/api/admin/settings/logo", { method: "DELETE" });
                    if (!res.ok) {
                      const err = await res.json().catch(() => null);
                      throw new Error(err?.error ?? "Failed to delete logo");
                    }
                    setForm((f) => ({ ...f, logoKey: null, logoUrl: null, logoBase64: null, logoMimeType: null }));
                    setMessage({ type: "success", text: "Logo removed." });
                    refresh();
                  } catch (err: unknown) {
                    setMessage({ type: "error", text: err instanceof Error ? err.message : "Delete failed" });
                  }
                }}
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

      {/* Auth Provider Section — super users only */}
      {currentUser?.isSuperUser && (
        <>
          <hr style={{ margin: "2rem 0", border: "none", borderTop: "1px solid #e5e7eb" }} />
          <h2>Authentication Provider</h2>
          <p style={{ color: "#6b7280", marginBottom: "1rem" }}>
            Configure the SSO provider for sign-in. Changes require a service restart.
          </p>

          {/* Warning banner */}
          <div style={{
            padding: "0.5rem 0.75rem",
            borderRadius: 6,
            marginBottom: "1rem",
            fontSize: 13,
            background: "#fef3c7",
            color: "#92400e",
            border: "1px solid #fde68a",
          }}>
            ⚠️ Changing auth settings will require a service restart. Active sessions will be preserved.
          </div>

          {/* Environment config banner */}
          {!authConfig && authLoaded && (
            <div style={{
              padding: "0.5rem 0.75rem",
              borderRadius: 6,
              marginBottom: "1rem",
              fontSize: 13,
              background: "#eff6ff",
              color: "#1e40af",
              border: "1px solid #bfdbfe",
            }}>
              Currently using environment configuration (no DB config set).
            </div>
          )}

          {!authLoaded && <p style={{ color: "#6b7280", fontSize: 14 }}>Loading auth provider...</p>}

          {authLoaded && (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem", marginBottom: "1rem" }}>
                {/* Provider ID */}
                <div>
                  <label style={{ display: "block", fontWeight: 600, marginBottom: 4, fontSize: 13 }}>Provider ID</label>
                  <input
                    type="text"
                    value={authForm.providerId}
                    onChange={(e) => setAuthForm((f) => ({ ...f, providerId: e.target.value }))}
                    placeholder="e.g. authentik, okta"
                    style={{ width: "100%", padding: "0.5rem 0.75rem", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 14 }}
                  />
                </div>

                {/* Display Name */}
                <div>
                  <label style={{ display: "block", fontWeight: 600, marginBottom: 4, fontSize: 13 }}>Display Name</label>
                  <input
                    type="text"
                    value={authForm.displayName}
                    onChange={(e) => setAuthForm((f) => ({ ...f, displayName: e.target.value }))}
                    placeholder="e.g. Company SSO"
                    style={{ width: "100%", padding: "0.5rem 0.75rem", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 14 }}
                  />
                </div>

                {/* Issuer URL */}
                <div>
                  <label style={{ display: "block", fontWeight: 600, marginBottom: 4, fontSize: 13 }}>
                    Issuer URL
                  </label>
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                    <input
                      type="url"
                      value={authForm.issuerUrl}
                      onChange={(e) => setAuthForm((f) => ({ ...f, issuerUrl: e.target.value }))}
                      placeholder="https://your-idp.example.com"
                      style={{ flex: 1, padding: "0.5rem 0.75rem", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 14 }}
                    />
                    <button
                      onClick={handleTestConnection}
                      disabled={testingConnection || !authForm.issuerUrl.trim() || !authForm.clientId.trim()}
                      style={{
                        padding: "0.5rem 0.875rem",
                        borderRadius: 6,
                        border: "1px solid #d1d5db",
                        background: "#fff",
                        cursor: testingConnection || !authForm.issuerUrl.trim() || !authForm.clientId.trim() ? "not-allowed" : "pointer",
                        fontSize: 13,
                        opacity: testingConnection || !authForm.issuerUrl.trim() || !authForm.clientId.trim() ? 0.6 : 1,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {testingConnection ? "Testing..." : "Test Connection"}
                    </button>
                  </div>
                </div>

                {/* Test result */}
                {testResult && (
                  <div style={{
                    padding: "0.5rem 0.75rem",
                    borderRadius: 6,
                    fontSize: 13,
                    background: testResult.ok ? "#ecfdf5" : "#fef2f2",
                    color: testResult.ok ? "#065f46" : "#991b1b",
                    border: `1px solid ${testResult.ok ? "#a7f3d0" : "#fecaca"}`,
                  }}>
                    {testResult.ok ? "✓ Connection successful" : `✗ ${testResult.error}`}
                  </div>
                )}

                {/* Internal Base URL — collapsible */}
                <div>
                  <button
                    onClick={() => setShowInternalBaseUrl((v) => !v)}
                    style={{
                      background: "none",
                      border: "none",
                      padding: 0,
                      cursor: "pointer",
                      fontSize: 13,
                      color: "#4b5563",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    {showInternalBaseUrl ? "▾" : "▸"} Internal Base URL
                    <span style={{ fontSize: 11, color: "#9ca3af", fontWeight: 400 }}>(optional — hairpin NAT)</span>
                  </button>
                  {showInternalBaseUrl && (
                    <input
                      type="url"
                      value={authForm.internalBaseUrl}
                      onChange={(e) => setAuthForm((f) => ({ ...f, internalBaseUrl: e.target.value }))}
                      placeholder="http://host.docker.internal:9080"
                      style={{ marginTop: 4, width: "100%", padding: "0.5rem 0.75rem", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 14 }}
                    />
                  )}
                </div>

                {/* Client ID */}
                <div>
                  <label style={{ display: "block", fontWeight: 600, marginBottom: 4, fontSize: 13 }}>Client ID</label>
                  <input
                    type="text"
                    value={authForm.clientId}
                    onChange={(e) => setAuthForm((f) => ({ ...f, clientId: e.target.value }))}
                    style={{ width: "100%", padding: "0.5rem 0.75rem", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 14 }}
                  />
                </div>

                {/* Client Secret */}
                <div>
                  <label style={{ display: "block", fontWeight: 600, marginBottom: 4, fontSize: 13 }}>Client Secret</label>
                  <input
                    type="password"
                    value={authSecretTouched ? authForm.clientSecret : (authForm.clientSecret === REDACTED ? "" : authForm.clientSecret)}
                    onChange={(e) => {
                      setAuthSecretTouched(true);
                      setAuthForm((f) => ({ ...f, clientSecret: e.target.value }));
                    }}
                    placeholder={authConfig ? "(unchanged)" : "Required"}
                    style={{ width: "100%", padding: "0.5rem 0.75rem", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 14 }}
                  />
                  {authConfig && !authSecretTouched && (
                    <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>Leave blank to keep existing secret.</p>
                  )}
                </div>

                {/* Scopes */}
                <div>
                  <label style={{ display: "block", fontWeight: 600, marginBottom: 4, fontSize: 13 }}>Scopes</label>
                  <input
                    type="text"
                    value={authForm.scopes}
                    onChange={(e) => setAuthForm((f) => ({ ...f, scopes: e.target.value }))}
                    style={{ width: "100%", padding: "0.5rem 0.75rem", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 14 }}
                  />
                </div>
              </div>

              {/* Auth messages */}
              {authMessage && (
                <div style={{
                  padding: "0.5rem 0.75rem",
                  borderRadius: 6,
                  marginBottom: "1rem",
                  fontSize: 14,
                  background: authMessage.type === "success" ? "#ecfdf5" : "#fef2f2",
                  color: authMessage.type === "success" ? "#065f46" : "#991b1b",
                  border: `1px solid ${authMessage.type === "success" ? "#a7f3d0" : "#fecaca"}`,
                }}>
                  {authMessage.text}
                </div>
              )}

              {/* Action buttons */}
              <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                <button
                  onClick={handleAuthSave}
                  disabled={authSaving || !authForm.providerId.trim() || !authForm.issuerUrl.trim() || !authForm.clientId.trim()}
                  style={{
                    padding: "0.5rem 1.25rem",
                    borderRadius: 6,
                    border: "none",
                    background: "#4f8a6f",
                    color: "#fff",
                    fontWeight: 600,
                    fontSize: 14,
                    cursor: authSaving || !authForm.providerId.trim() || !authForm.issuerUrl.trim() || !authForm.clientId.trim() ? "not-allowed" : "pointer",
                    opacity: authSaving ? 0.7 : 1,
                  }}
                >
                  {authSaving ? "Saving..." : "Save"}
                </button>
                <button
                  onClick={handleResetToEnvDefaults}
                  style={{
                    padding: "0.5rem 1.25rem",
                    borderRadius: 6,
                    border: confirmReset ? "1px solid #dc2626" : "1px solid #d1d5db",
                    background: confirmReset ? "#fef2f2" : "#fff",
                    color: confirmReset ? "#dc2626" : "#6b7280",
                    fontWeight: 500,
                    fontSize: 14,
                    cursor: "pointer",
                  }}
                >
                  {confirmReset ? "Confirm Reset to Env Defaults?" : "Reset to Environment Defaults"}
                </button>
                {confirmReset && (
                  <button
                    onClick={() => setConfirmReset(false)}
                    style={{
                      padding: "0.5rem 0.75rem",
                      borderRadius: 6,
                      border: "1px solid #d1d5db",
                      background: "#fff",
                      color: "#6b7280",
                      fontSize: 14,
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
