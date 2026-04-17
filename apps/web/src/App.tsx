import { Routes, Route, Link, useLocation, Navigate, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { AppointmentsPage } from "./pages/Appointments.js";
import { ClientsPage } from "./pages/Clients.js";
import { ServicesPage } from "./pages/Services.js";
import { StaffPage } from "./pages/Staff.js";
import { InvoicesPage } from "./pages/Invoices.js";
import { BookPage } from "./pages/Book.js";
import { ReportsPage } from "./pages/Reports.js";
import { GroupBookingPage } from "./pages/GroupBooking.js";
import { SettingsPage } from "./pages/Settings.js";
import { BookingConfirmedPage } from "./pages/BookingConfirmed.js";
import { BookingCancelledPage } from "./pages/BookingCancelled.js";
import { BookingErrorPage } from "./pages/BookingError.js";
import { SetupWizard } from "./pages/SetupWizard.tsx";
import { CustomerPortal } from "./portal/CustomerPortal.js";
import { DevLoginSelector, getDevUser } from "./pages/DevLoginSelector.js";
import { DevSessionIndicator } from "./components/DevSessionIndicator.js";
import { BrandingProvider, useBranding } from "./BrandingContext.js";
import { GlobalSearch } from "./components/GlobalSearch.js";
import { useSession, signIn, signOut } from "./lib/auth-client.js";

function LoginPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [providers, setProviders] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/providers")
      .then((r) => r.json())
      .then((data) => setProviders(data.providers ?? []))
      .catch(() => setProviders([]));
    const params = new URLSearchParams(window.location.search);
    const authError = params.get("error");
    if (authError) setError(authError.replace(/_/g, " "));
  }, []);

  const handleSocialLogin = async (provider: string) => {
    setIsLoading(true);
    setError(null);
    const result = await signIn.social({ provider, callbackURL: window.location.origin });
    if (result?.error) {
      setError(result.error.message ?? "Sign-in failed");
      setIsLoading(false);
    }
  };

  const isGoogle = providers.includes("google");
  const isGitHub = providers.includes("github");
  const isAuthentik = providers.includes("authentik");

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: "100vh",
        fontFamily: "system-ui, sans-serif",
        background: "#f0f2f5",
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          padding: "2rem 2.5rem",
          boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
          textAlign: "center",
          minWidth: 280,
        }}
      >
        <h1 style={{ fontSize: 22, marginBottom: "0.5rem", color: "#1a202c" }}>GroomBook</h1>
        <p style={{ color: "#6b7280", marginBottom: "1.5rem", fontSize: 14 }}>
          Sign in to continue
        </p>
        {error && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, padding: "0.5rem 0.75rem", marginBottom: "1rem", color: "#991b1b", fontSize: 13 }}>
            {error}
          </div>
        )}
        {isGoogle && (
          <button
            onClick={() => handleSocialLogin("google")}
            disabled={isLoading}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              width: "100%",
              padding: "0.6rem 1.5rem",
              borderRadius: 6,
              border: "1px solid #e2e8f0",
              background: "#fff",
              color: "#1a202c",
              fontWeight: 600,
              fontSize: 14,
              cursor: isLoading ? "wait" : "pointer",
              opacity: isLoading ? 0.7 : 1,
              marginBottom: "0.5rem",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Sign in with Google
          </button>
        )}
        {isGitHub && (
          <button
            onClick={() => handleSocialLogin("github")}
            disabled={isLoading}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              width: "100%",
              padding: "0.6rem 1.5rem",
              borderRadius: 6,
              border: "1px solid #e2e8f0",
              background: "#24292f",
              color: "#fff",
              fontWeight: 600,
              fontSize: 14,
              cursor: isLoading ? "wait" : "pointer",
              opacity: isLoading ? 0.7 : 1,
              marginBottom: isAuthentik ? "0.5rem" : 0,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
            Sign in with GitHub
          </button>
        )}
        {isAuthentik && (
          <button
            onClick={() => handleSocialLogin("authentik")}
            disabled={isLoading}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              width: "100%",
              padding: "0.6rem 1.5rem",
              borderRadius: 6,
              border: "none",
              background: "#4f8a6f",
              color: "#fff",
              fontWeight: 600,
              fontSize: 14,
              cursor: isLoading ? "wait" : "pointer",
              opacity: isLoading ? 0.7 : 1,
            }}
          >
            {isLoading ? "Redirecting…" : "Sign in with SSO"}
          </button>
        )}
      </div>
    </div>
  );
}

const NAV_LINKS = [
  { to: "/admin", label: "Appointments" },
  { to: "/admin/clients", label: "Clients" },
  { to: "/admin/services", label: "Services" },
  { to: "/admin/staff", label: "Staff" },
  { to: "/admin/invoices", label: "Invoices" },
  { to: "/admin/group-bookings", label: "Group Bookings" },
  { to: "/admin/reports", label: "Reports" },
  { to: "/admin/settings", label: "Settings" },
  { to: "/", label: "Customer Portal" },
];

function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { branding } = useBranding();

  const logoSrc = branding.logoBase64 && branding.logoMimeType
    ? `data:${branding.logoMimeType};base64,${branding.logoBase64}`
    : null;

  return (
    <div style={{ minHeight: "100vh", fontFamily: "system-ui, sans-serif", background: "#f0f2f5" }}>
      <nav
        style={{
          padding: "0 1.25rem",
          height: 52,
          borderBottom: "1px solid #e2e8f0",
          display: "flex",
          alignItems: "center",
          gap: "0.25rem",
          background: "#fff",
          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04)",
          position: "sticky",
          top: 0,
          zIndex: 50,
        }}
      >
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginRight: "1.25rem",
          flexShrink: 0,
        }}>
          {logoSrc && (
            <img src={logoSrc} alt="" style={{ width: 24, height: 24, objectFit: "contain" }} />
          )}
          <strong style={{
            fontSize: 17,
            color: "#1a202c",
            letterSpacing: "-0.02em",
          }}>
            {branding.businessName}
          </strong>
        </div>
        <GlobalSearch />
        <div style={{
          display: "flex",
          overflowX: "auto",
          flex: 1,
          minWidth: 0,
          gap: "0.25rem",
        }}>
          <Link
            to="/admin/book"
            style={{
              padding: "0.4rem 0.85rem",
              borderRadius: 6,
              textDecoration: "none",
              fontSize: 13,
              fontWeight: 600,
              color: "#fff",
              background: branding.primaryColor,
              boxShadow: "0 1px 2px rgba(79, 138, 111, 0.3)",
              flexShrink: 0,
            }}
          >
            Book
          </Link>
          {NAV_LINKS.map(({ to, label }) => {
            const active =
              to === "/admin"
                ? location.pathname === "/admin"
                : location.pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                style={{
                  padding: "0.4rem 0.75rem",
                  borderRadius: 6,
                  textDecoration: "none",
                  fontSize: 13,
                  fontWeight: active ? 600 : 500,
                  color: active ? "#2d6a4f" : "#4b5563",
                  background: active ? "#ecfdf5" : "transparent",
                  flexShrink: 0,
                }}
              >
                {label}
              </Link>
            );
          })}
        </div>
        <button
          onClick={async () => {
            await signOut();
            navigate("/login");
          }}
          style={{
            flexShrink: 0,
            padding: "0.4rem 0.85rem",
            borderRadius: 6,
            border: "1px solid #e2e8f0",
            background: "#fff",
            color: "#4b5563",
            fontSize: 13,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          Logout
        </button>
      </nav>
      <main style={{ padding: "1.25rem 1.5rem" }}>
        <Routes>
          <Route path="/" element={<AppointmentsPage />} />
          <Route path="/clients" element={<ClientsPage />} />
          <Route path="/services" element={<ServicesPage />} />
          <Route path="/staff" element={<StaffPage />} />
          <Route path="/invoices" element={<InvoicesPage />} />
          <Route path="/book" element={<BookPage />} />
          <Route path="/group-bookings" element={<GroupBookingPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  );
}

export function App() {
  const location = useLocation();
  const [authDisabled, setAuthDisabled] = useState<boolean | null>(null);
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);
  const { data: rawSession, isPending: rawSessionLoading } = useSession();
  // In dev mode (authDisabled=true), session state is irrelevant - skip useSession result
  const session = authDisabled ? null : rawSession;
  const sessionLoading = authDisabled ? false : rawSessionLoading;

  useEffect(() => {
    fetch("/api/dev/config")
      .then((r) => r.json())
      .then((data) => setAuthDisabled(data.authDisabled === true))
      .catch(() => setAuthDisabled(false));
  }, []);

  // After session is confirmed, check if setup is needed
  useEffect(() => {
    if (authDisabled === null || sessionLoading) return;
    // Skip if no authenticated session (will redirect to login or dev selector)
    if (!authDisabled && !session) return;
    if (authDisabled && !getDevUser()) return;

    fetch("/api/setup/status")
      .then((r) => r.json())
      .then((data) => setNeedsSetup(data.needsSetup === true))
      .catch(() => setNeedsSetup(false));
  }, [authDisabled, session, sessionLoading]);

  // Public booking redirect pages — no auth or portal chrome needed
  if (location.pathname === "/booking/confirmed") {
    return <BookingConfirmedPage />;
  }
  if (location.pathname === "/booking/cancelled") {
    return <BookingCancelledPage />;
  }
  if (location.pathname === "/booking/error") {
    return <BookingErrorPage />;
  }

  // Setup wizard — standalone, no admin chrome
  if (location.pathname === "/setup") {
    return (
      <BrandingProvider>
        <SetupWizard onSetupComplete={() => setNeedsSetup(false)} />
      </BrandingProvider>
    );
  }

  // Still loading auth state or setup check (skip setup check in dev mode)
  if (authDisabled === null || sessionLoading) return null;

  // Dev mode: show login selector (no setup check needed in dev mode)
  if (authDisabled && location.pathname === "/login") {
    return <DevLoginSelector />;
  }

  // Dev mode: use dev login selector (no setup check needed in dev mode)
  if (authDisabled && !getDevUser()) {
    return <Navigate to="/login" replace />;
  }

  // Show login BEFORE checking needsSetup (needsSetup is never set for unauthenticated users)
  if (!authDisabled && !session) {
    return <LoginPage />;
  }

  // Production: need setup check
  if (needsSetup === null) return null;

  // Redirect to setup wizard if needed
  if (needsSetup) {
    return <Navigate to="/setup" replace />;
  }

  // Redirect authenticated users to /admin (but preserve impersonation flow via ?sessionId=)
  const searchParams = new URLSearchParams(location.search);
  if (!authDisabled && session && !location.pathname.startsWith("/admin") && !searchParams.has("sessionId")) {
    return <Navigate to="/admin" replace />;
  }

  // Don't render portal chrome at /login — DevLoginSelector is shown instead
  const showCustomerPortal = !location.pathname.startsWith("/admin") && location.pathname !== "/login";

  return (
    <BrandingProvider>
      {location.pathname.startsWith("/admin") ? (
        <>
          <Routes>
            <Route path="/admin/*" element={<AdminLayout />} />
          </Routes>
          {authDisabled && <DevSessionIndicator />}
        </>
      ) : showCustomerPortal ? (
        <>
          <CustomerPortal />
          {authDisabled && <DevSessionIndicator />}
        </>
      ) : null}
    </BrandingProvider>
  );
}
