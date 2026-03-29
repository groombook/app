import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useBranding } from "../BrandingContext.js";

const STEPS = [
  { title: "Welcome", description: "Welcome to GroomBook! Let's get your business set up." },
  { title: "Business Name", description: "What is the name of your business?" },
  { title: "Super User", description: "You will be designated as a Super User with full administrative access." },
  { title: "Add Another Admin", description: "Consider adding a second Super User as a backup. This is optional but recommended." },
  { title: "All Set!", description: "Your GroomBook instance is ready to use." },
];

export function SetupWizard() {
  const navigate = useNavigate();
  const { refresh: refreshBranding } = useBranding();
  const [step, setStep] = useState(0);
  const [businessName, setBusinessName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [guardLoading, setGuardLoading] = useState(true);

  // Guard: redirect if setup is not needed
  useEffect(() => {
    fetch("/api/setup/status")
      .then((r) => r.json())
      .then((data) => {
        if (data.needsSetup === false) {
          navigate("/admin", { replace: true });
        } else {
          setGuardLoading(false);
        }
      })
      .catch(() => setGuardLoading(false));
  }, [navigate]);

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const canGoBack = step > 0 && step < STEPS.length - 1;
  const canGoNext = step < STEPS.length - 1 && (step !== 1 || businessName.trim().length > 0);

  const handleNext = async () => {
    if (step === STEPS.length - 1) {
      // Done - redirect to admin
      navigate("/admin");
      return;
    }
    if (step === 1 && businessName.trim()) {
      // Step 2 (index 1) -> Step 3 (index 2): submit setup
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/setup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ businessName: businessName.trim() }),
        });
        if (!res.ok) {
          const data = await res.json();
          setError(data.error || "Setup failed. Please try again.");
          setLoading(false);
          return;
        }
        // Refresh branding so the nav bar shows the new business name
        refreshBranding();
      } catch (e) {
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

  if (guardLoading) {
    return (
      <div style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f0f2f5",
        fontFamily: "system-ui, sans-serif",
      }}>
        <p style={{ color: "#6b7280" }}>Checking setup status…</p>
      </div>
    );
  }

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
        {/* Progress dots */}
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

        {/* Step indicator */}
        <p style={{ margin: "0 0 0.5rem", fontSize: 13, color: "#6b7280", fontWeight: 500 }}>
          Step {step + 1} of {STEPS.length}
        </p>

        {/* Title */}
        <h2 style={{ margin: "0 0 0.75rem", fontSize: 22, fontWeight: 700, color: "#1a202c" }}>
          {current.title}
        </h2>

        {/* Description */}
        <p style={{ margin: "0 0 1.5rem", fontSize: 15, color: "#4b5563", lineHeight: 1.6 }}>
          {current.description}
        </p>

        {/* Step 2: Business name input */}
        {step === 1 && (
          <input
            type="text"
            placeholder="e.g. Happy Paws Grooming"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && canGoNext && handleNext()}
            autoFocus
            style={{
              width: "100%",
              padding: "0.6rem 0.85rem",
              borderRadius: 8,
              border: "1px solid #d1d5db",
              fontSize: 15,
              outline: "none",
              boxSizing: "border-box",
              marginBottom: error ? "0.5rem" : 0,
            }}
          />
        )}

        {/* Step 3: Info about super user */}
        {step === 2 && (
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

        {/* Step 4: Info about second admin */}
        {step === 3 && (
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

        {/* Error message */}
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

        {/* Navigation buttons */}
        <div style={{
          display: "flex",
          gap: "0.75rem",
          marginTop: step === 3 ? "1.5rem" : "1.25rem",
          justifyContent: step === 0 ? "flex-end" : "space-between",
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
            onClick={handleNext}
            disabled={!canGoNext || loading}
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
            {loading ? "Setting up..." : isLast ? "Go to Dashboard" : step === 1 ? "Continue" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}