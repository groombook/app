import { Routes, Route, Link, useLocation, Navigate } from "react-router-dom";
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
import { SetupWizard } from "./pages/SetupWizard.jsx";
import { CustomerPortal } from "./portal/CustomerPortal.js";
import { DevLoginSelector, getDevUser } from "./pages/DevLoginSelector.js";
import { DevSessionIndicator } from "./components/DevSessionIndicator.js";
import { BrandingProvider, useBranding } from "./BrandingContext.js";
import { GlobalSearch } from "./components/GlobalSearch.js";
import { useSession, signIn } from "./lib/auth-client.js";

function LoginPage() {
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async () => {
    setIsLoading(true);
    await signIn.social({ provider: "authentik", callbackURL: window.location.origin });
  };

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
        <button
          onClick={handleLogin}
          disabled={isLoading}
          style={{
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
            marginRight: "0.5rem",
            boxShadow: "0 1px 2px rgba(79, 138, 111, 0.3)",
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
              }}
            >
              {label}
            </Link>
          );
        })}
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
        <SetupWizard />
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

  return (
    <BrandingProvider>
      {location.pathname.startsWith("/admin") ? (
        <>
          <Routes>
            <Route path="/admin/*" element={<AdminLayout />} />
          </Routes>
          {authDisabled && <DevSessionIndicator />}
        </>
      ) : (
        <>
          <CustomerPortal />
          {authDisabled && <DevSessionIndicator />}
        </>
      )}
    </BrandingProvider>
  );
}
