import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useBranding } from "../BrandingContext.js";

interface SetupStatus {
  showAuthProviderStep?: boolean;
}

interface TestResult {
  ok: boolean;
  error?: string;
}

interface AuthFormState {
  providerId: string;
  displayName: string;
  issuerUrl: string;
  internalBaseUrl: string;
  clientId: string;
  clientSecret: string;
  scopes: string;
}

interface Step {
  id: string;
  title: string;
  description: string;
}

export function SetupWizard({ onSetupComplete }: { onSetupComplete?: () => void }) {
  const navigate = useNavigate();
  const { refresh: refreshBranding } = useBranding();

  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);

  const [authForm, setAuthForm] = useState<AuthFormState>({
    providerId: "authentik",
    displayName: "",
    issuerUrl: "",
    internalBaseUrl: "",
    clientId: "",
    clientSecret: "",
    scopes: "openid profile email",
  });
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  const [step, setStep] = useState(0);
  const [businessName, setBusinessName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/setup/status")
      .then((r) => r.json() as Promise<SetupStatus>)
      .then((data) => {
        setSetupStatus(data);
        setLoadingStatus(false);
      })
      .catch(() => {
        setLoadingStatus(false);
      });
  }, []);

  const STEPS: Step[] = setupStatus?.showAuthProviderStep
    ? [
        { id: "welcome", title: "Welcome", description: "Welcome to GroomBook! Let's get your business set up." },
        { id: "auth", title: "Auth Provider", description: "Configure your authentication provider to secure your GroomBook instance." },
        { id: "business", title: "Business Name", description: "What is the name of your business?" },
        { id: "superuser", title: "Super User", description: "You will be designated as a Super User with full administrative access." },
        { id: "admin", title: "Add Another Admin", description: "Consider adding a second Super User as a backup. This is optional but recommended." },
        { id: "done", title: "All Set!", description: "Your GroomBook instance is ready to use." },
      ]
    : [
        { id: "welcome", title: "Welcome", description: "Welcome to GroomBook! Let's get your business set up." },
        { id: "business", title: "Business Name", description: "What is the name of your business?" },
        { id: "superuser", title: "Super User", description: "You will be designated as a Super User with full administrative access." },
        { id: "admin", title: "Add Another Admin", description: "Consider adding a second Super User as a backup. This is optional but recommended." },
        { id: "done", title: "All Set!", description: "Your GroomBook instance is ready to use." },
      ];

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const isFirst = step === 0;
  const canGoBack = step > 0 && step < STEPS.length - 1;

  const canGoNext = (() => {
    if (step === STEPS.length - 1) return true;
    if (current?.id === "business") return businessName.trim().length > 0;
    if (current?.id === "auth") {
      return (
        authForm.displayName.trim().length > 0 &&
        authForm.issuerUrl.trim().length > 0 &&
        authForm.clientId.trim().length > 0 &&
        authForm.clientSecret.trim().length > 0
      );
    }
    return true;
  })();

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/setup/auth-provider/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId: authForm.providerId,
          displayName: authForm.displayName,
          issuerUrl: authForm.issuerUrl,
          internalBaseUrl: authForm.internalBaseUrl || null,
          clientId: authForm.clientId,
          scopes: authForm.scopes,
        }),
      });
      const data = (await res.json()) as TestResult;
      setTestResult(data);
    } catch {
      setTestResult({ ok: false, error: "Network error. Please try again." });
    } finally {
      setTestingConnection(false);
    }
  };

  const handleNext = async () => {
    if (step === STEPS.length - 1) {
      navigate("/admin");
      return;
    }

    if (current?.id === "auth") {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/setup/auth-provider", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            providerId: authForm.providerId,
            displayName: authForm.displayName,
            issuerUrl: authForm.issuerUrl,
            internalBaseUrl: authForm.internalBaseUrl || null,
            clientId: authForm.clientId,
            clientSecret: authForm.clientSecret,
            scopes: authForm.scopes,
          }),
        });
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          setError(data.error || "Failed to save auth provider configuration. Please try again.");
          setLoading(false);
          return;
        }
      } catch {
        setError("Network error. Please try again.");
        setLoading(false);
        return;
      }
      setLoading(false);
    }

    if (current?.id === "business" && businessName.trim()) {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/setup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ businessName: businessName.trim() }),
        });
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          setError(data.error || "Setup failed. Please try again.");
          setLoading(false);
          return;
        }
        refreshBranding();
        if (onSetupComplete) onSetupComplete();
      } catch {
        setError("Network error. Please try again.");
        setLoading(false);
        return;
      }
      setLoading(false);
    }

    setStep((s) => s + 1);
  };

  const handleBack = () => {
    if (step > 0) setStep((s) => s - 1);
  };

  if (loadingStatus) {
    return (
      <div style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f0f2f5",
        fontFamily: "system-ui, sans-serif",
      }}>
        <p style={{ color: "#6b7280" }}>Loading...</p>
      </div>
    );
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "0.6rem 0.85rem",
    borderRadius: 8,
    border: "1px solid #d1d5db",
    fontSize: 15,
    outline: "none",
    boxSizing: "border-box",
    marginBottom: error ? "0.5rem" : 0,
  };

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "#f0f2f5",
      fontFamily: "system-ui, sans-serif",
    }}>
      <div style={{
        background: "#fff",
        borderRadius: 12,
        boxShadow: "0 4px 24px rgba(0,0,0,0.10)",
        padding: "2.5rem 3rem",
        maxWidth: 480,
        width: "100%",
      }}>
        <div style={{ display: "flex", gap: 6, marginBottom: "2rem", justifyContent: "center" }}>
          {STEPS.map((_, i) => (
            <div
              key={i}
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: i === step ? "#4f8a6f" : i < step ? "#4f8a6f" : "#e2e8f0",
                opacity: i === step ? 1 : i < step ? 0.5 : 1,
                transition: "background 0.2s",
              }}
            />
          ))}
        </div>

        <p style={{ margin: "0 0 0.5rem", fontSize: 13, color: "#6b7280", fontWeight: 500 }}>
          Step {step + 1} of {STEPS.length}
        </p>

        <h2 style={{ margin: "0 0 0.75rem", fontSize: 22, fontWeight: 700, color: "#1a202c" }}>
          {current?.title}
        </h2>

        <p style={{ margin: "0 0 1.5rem", fontSize: 15, color: "#4b5563", lineHeight: 1.6 }}>
          {current?.description}
        </p>

        {current?.id === "business" && (
          <input
            type="text"
            placeholder="e.g. Happy Paws Grooming"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && canGoNext && void handleNext()}
            autoFocus
            style={inputStyle}
          />
        )}

        {current?.id === "auth" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                Provider ID
              </label>
              <input
                type="text"
                placeholder="e.g. authentik"
                value={authForm.providerId}
                onChange={(e) => setAuthForm((f) => ({ ...f, providerId: e.target.value }))}
                style={{ ...inputStyle, fontSize: 14 }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                Display Name
              </label>
              <input
                type="text"
                placeholder="e.g. Company SSO"
                value={authForm.displayName}
                onChange={(e) => setAuthForm((f) => ({ ...f, displayName: e.target.value }))}
                style={{ ...inputStyle, fontSize: 14 }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                Issuer URL
              </label>
              <input
                type="url"
                placeholder="https://auth.example.com"
                value={authForm.issuerUrl}
                onChange={(e) => setAuthForm((f) => ({ ...f, issuerUrl: e.target.value }))}
                style={{ ...inputStyle, fontSize: 14 }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                Internal Base URL <span style={{ fontWeight: 400, color: "#6b7280" }}>(optional, for hairpin NAT)</span>
              </label>
              <input
                type="url"
                placeholder="https://auth.internal.example.com"
                value={authForm.internalBaseUrl}
                onChange={(e) => setAuthForm((f) => ({ ...f, internalBaseUrl: e.target.value }))}
                style={{ ...inputStyle, fontSize: 14 }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                Client ID
              </label>
              <input
                type="text"
                placeholder="Your OAuth client ID"
                value={authForm.clientId}
                onChange={(e) => setAuthForm((f) => ({ ...f, clientId: e.target.value }))}
                style={{ ...inputStyle, fontSize: 14 }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                Client Secret
              </label>
              <input
                type="password"
                placeholder="Your OAuth client secret"
                value={authForm.clientSecret}
                onChange={(e) => setAuthForm((f) => ({ ...f, clientSecret: e.target.value }))}
                style={{ ...inputStyle, fontSize: 14 }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                Scopes
              </label>
              <input
                type="text"
                placeholder="openid profile email"
                value={authForm.scopes}
                onChange={(e) => setAuthForm((f) => ({ ...f, scopes: e.target.value }))}
                style={{ ...inputStyle, fontSize: 14 }}
              />
            </div>

            <button
              type="button"
              onClick={() => { void handleTestConnection(); }}
              disabled={testingConnection || !authForm.issuerUrl || !authForm.clientId}
              style={{
                padding: "0.45rem 0.85rem",
                borderRadius: 6,
                border: "1px solid #d1d5db",
                background: "#fff",
                color: "#374151",
                fontSize: 13,
                fontWeight: 500,
                cursor: testingConnection || !authForm.issuerUrl || !authForm.clientId ? "not-allowed" : "pointer",
                opacity: testingConnection || !authForm.issuerUrl || !authForm.clientId ? 0.6 : 1,
                alignSelf: "flex-start",
              }}
            >
              {testingConnection ? "Testing..." : "Test Connection"}
            </button>

            {testResult && (
              <div style={{
                padding: "0.5rem 0.75rem",
                borderRadius: 6,
                fontSize: 13,
                background: testResult.ok ? "#ecfdf5" : "#fef2f2",
                color: testResult.ok ? "#065f46" : "#991b1b",
                border: `1px solid ${testResult.ok ? "#a7f3d0" : "#fecaca"}`,
              }}>
                {testResult.ok
                  ? "Connection successful!"
                  : `Connection failed: ${testResult.error}`}
              </div>
            )}
          </div>
        )}

        {current?.id === "superuser" && (
          <div style={{
            background: "#f0fdf4",
            border: "1px solid #bbf7d0",
            borderRadius: 8,
            padding: "0.85rem 1rem",
            fontSize: 14,
            color: "#166534",
            marginBottom: "1rem",
          }}>
            As a Super User, you can manage all settings, staff, and appointments.
          </div>
        )}

        {current?.id === "admin" && (
          <div style={{
            background: "#fffbeb",
            border: "1px solid #fde68a",
            borderRadius: 8,
            padding: "0.85rem 1rem",
            fontSize: 14,
            color: "#92400e",
          }}>
            You can add additional Super Users from the Staff management page after setup.
          </div>
        )}

        {error && (
          <p style={{
            margin: "0.5rem 0 0",
            fontSize: 13,
            color: "#dc2626",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: 6,
            padding: "0.5rem 0.75rem",
          }}>
            {error}
          </p>
        )}

        <div style={{
          display: "flex",
          gap: "0.75rem",
          marginTop: current?.id === "auth" ? "1.25rem" : current?.id === "admin" ? "1.5rem" : "1.25rem",
          justifyContent: isFirst ? "flex-end" : "space-between",
        }}>
          {canGoBack && (
            <button
              onClick={handleBack}
              disabled={loading}
              style={{
                padding: "0.55rem 1.1rem",
                borderRadius: 8,
                border: "1px solid #d1d5db",
                background: "#fff",
                color: "#374151",
                fontSize: 14,
                fontWeight: 500,
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.6 : 1,
              }}
            >
              Back
            </button>
          )}
          <button
            onClick={() => { void handleNext(); }}
            disabled={(!canGoNext && !isLast) || loading}
            style={{
              padding: "0.55rem 1.25rem",
              borderRadius: 8,
              border: "none",
              background: canGoNext && !loading ? "#4f8a6f" : "#9ca3af",
              color: "#fff",
              fontSize: 14,
              fontWeight: 600,
              cursor: canGoNext && !loading ? "pointer" : "not-allowed",
              opacity: loading ? 0.7 : 1,
              marginLeft: canGoBack ? 0 : "auto",
            }}
          >
            {loading
              ? "Setting up..."
              : isLast
                ? "Go to Dashboard"
                : current?.id === "business" || current?.id === "auth"
                  ? "Continue"
                  : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}