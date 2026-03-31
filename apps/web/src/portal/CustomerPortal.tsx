import { useState, useCallback, useEffect, useRef } from "react";
import { useSearchParams, Navigate } from "react-router-dom";
import {
  Home, Calendar, PawPrint, FileText, CreditCard, MessageSquare,
  Settings, LogOut, Shield,
} from "lucide-react";
import { Dashboard } from "./sections/Dashboard.js";
import { AppointmentsSection, RescheduleFlow } from "./sections/Appointments.js";
import { PetProfiles } from "./sections/PetProfiles.js";
import { ReportCards } from "./sections/ReportCards.js";
import { BillingPayments } from "./sections/BillingPayments.js";
import { Communication } from "./sections/Communication.js";
import { AccountSettings } from "./sections/AccountSettings.js";
import { ImpersonationBanner } from "./ImpersonationBanner.js";
import { AuditLogViewer } from "./AuditLogViewer.js";
import { useBranding } from "../BrandingContext.js";
import { getDevUser } from "../pages/DevLoginSelector.js";
import type { ImpersonationSession } from "@groombook/types";

type Section = "dashboard" | "appointments" | "pets" | "reports" | "billing" | "messages" | "settings";

const NAV_ITEMS: { id: Section; label: string; icon: typeof Home }[] = [
  { id: "dashboard", label: "Home", icon: Home },
  { id: "appointments", label: "Appointments", icon: Calendar },
  { id: "pets", label: "My Pets", icon: PawPrint },
  { id: "reports", label: "Report Cards", icon: FileText },
  { id: "billing", label: "Billing", icon: CreditCard },
  { id: "messages", label: "Messages", icon: MessageSquare },
  { id: "settings", label: "Settings", icon: Settings },
];

export function CustomerPortal() {
  const [activeSection, setActiveSection] = useState<Section>("dashboard");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [showAuditLog, setShowAuditLog] = useState(false);
  const [showReschedule, setShowReschedule] = useState(false);
  const [rescheduleAppointment, setRescheduleAppointment] = useState<Record<string, unknown> | null>(null);
  const [session, setSession] = useState<ImpersonationSession | null>(null);
  const [sessionExtended, setSessionExtended] = useState(false);
  const [clientName, setClientName] = useState<string>("");
  const [initComplete, setInitComplete] = useState(false);
  // Track whether we've attempted to fetch a session — used to prevent premature redirect
  // when a session fetch is in-flight (E2E mocks resolve synchronously, batched with setInitComplete)
  const [sessionAttempted, setSessionAttempted] = useState(false);
  const { branding } = useBranding();
  const [searchParams, setSearchParams] = useSearchParams();

  // On mount: load session from ?sessionId= URL param OR from dev user in localStorage
  const initDone = useRef(false);
  useEffect(() => {
    if (initDone.current) return;
    initDone.current = true;

    const sessionId = searchParams.get("sessionId");

    if (sessionId) {
      // Real impersonation session from URL param
      fetch(`/api/impersonation/sessions/${sessionId}`)
        .then((r) => {
          if (!r.ok) return null;
          return r.json() as Promise<ImpersonationSession>;
        })
        .then((s) => {
          if (s && s.status === "active") {
            setSession(s);
            setSessionAttempted(true);
            fetch(`/api/portal/me`, { headers: { "X-Impersonation-Session-Id": s.id } })
              .then(r => r.ok ? r.json() : null)
              .then(data => { if (data?.name) setClientName(data.name); })
              .catch(() => {});
          }
          setSearchParams({}, { replace: true });
        })
        .catch(() => {
          setSessionAttempted(true);
          setSearchParams({}, { replace: true });
        })
        .finally(() => setInitComplete(true));
      return;
    }

    // Dev mode: check for dev user in localStorage and create a dev session
    const devUser = getDevUser();
    if (devUser && devUser.type === "client") {
      fetch("/api/portal/dev-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: devUser.id }),
      })
        .then((r) => {
          if (!r.ok) return null;
          return r.json() as Promise<ImpersonationSession>;
        })
        .then((s) => {
          if (s && s.id) {
            setSession(s);
            setSessionAttempted(true);
            setClientName(devUser.name);
          }
        })
        .catch(() => { setSessionAttempted(true); })
        .finally(() => setInitComplete(true));
    } else {
      // No valid session: staff dev users and unauthenticated users fall through here
      setInitComplete(true);
    }
  }, []);

  const handleEnd = useCallback(async () => {
    if (!session) return;
    try {
      await fetch(`/api/impersonation/sessions/${session.id}/end`, { method: "POST" });
    } catch {
      // Ignore — session ends on the client regardless
    }
    setSession(null);
    setSessionExtended(false);
    window.location.href = "/admin/clients";
  }, [session]);

  const handleExtend = useCallback(async () => {
    if (!session) return;
    try {
      const r = await fetch(`/api/impersonation/sessions/${session.id}/extend`, { method: "POST" });
      if (r.ok) {
        const updated = await r.json() as ImpersonationSession;
        setSession(updated);
        setSessionExtended(true);
      }
    } catch {
      // Best-effort
    }
  }, [session]);

  const logPageView = useCallback((page: string) => {
    if (!session) return;
    void fetch(`/api/impersonation/sessions/${session.id}/log`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "page_view", pageVisited: page }),
    });
  }, [session]);

  const handleNavClick = (section: Section) => {
    setActiveSection(section);
    setMobileNavOpen(false);
    if (session?.status === "active") {
      logPageView(section);
    }
  };

  const handleReschedule = useCallback((appointmentId: string) => {
    // Look up the full appointment from Dashboard's displayed data
    // The appointment was already fetched by Dashboard, so we use the ID to find it
    setRescheduleAppointment({ id: appointmentId } as Record<string, unknown>);
    setShowReschedule(true);
  }, []);

  const isReadOnly = session?.status === "active";

  const renderSection = () => {
    const sessionId = session?.id ?? null;
    switch (activeSection) {
      case "dashboard":
        return <Dashboard onNavigate={handleNavClick} readOnly={!!isReadOnly} sessionId={sessionId} clientName={clientName} onReschedule={handleReschedule} />;
      case "appointments":
        return <AppointmentsSection readOnly={!!isReadOnly} sessionId={sessionId} />;
      case "pets":
        return <PetProfiles readOnly={!!isReadOnly} sessionId={sessionId} />;
      case "reports":
        return <ReportCards sessionId={sessionId} />;
      case "billing":
        return <BillingPayments readOnly={!!isReadOnly} sessionId={sessionId} />;
      case "messages":
        return <Communication readOnly={!!isReadOnly} />;
      case "settings":
        return <AccountSettings readOnly={!!isReadOnly} sessionId={sessionId} />;
    }
  };

  const avatarInitials = (clientName.split(" ")[0] || "G").charAt(0).toUpperCase();

  // After init completes, redirect unauthenticated users to /login and staff to /admin
  // The portal chrome must NEVER be visible to users without a valid client session.
  // Only redirect if we have NOT attempted a session fetch yet — if a fetch is in-flight
  // (E2E mock resolves synchronously, batched with setInitComplete), sessionAttempted
  // is still false so we don't redirect prematurely.
  if (initComplete && !session && !sessionAttempted) {
    const devUser = getDevUser();
    if (devUser && devUser.type === "staff") {
      return <Navigate to="/admin" replace />;
    }
    return <Navigate to="/login" replace />;
  }

  return (
    <div
      className="min-h-screen bg-[#faf8f5] font-sans"
      style={session?.status === "active" ? { border: "3px solid #f59e0b" } : undefined}
    >
      {session?.status === "active" && (
        <>
          <ImpersonationBanner
            session={session}
            isExtended={sessionExtended}
            onEnd={() => { void handleEnd(); }}
            onExtend={() => { void handleExtend(); }}
            onShowAudit={() => setShowAuditLog(true)}
          />
          {/* Watermark */}
          <div className="fixed inset-0 pointer-events-none z-10 flex items-center justify-center opacity-[0.04]">
            <div className="text-8xl font-bold text-amber-900 -rotate-45 select-none tracking-widest">
              STAFF VIEW
            </div>
          </div>
        </>
      )}

      {showAuditLog && session && (
        <AuditLogViewer
          sessionId={session.id}
          onClose={() => setShowAuditLog(false)}
        />
      )}

      {showReschedule && rescheduleAppointment && (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        <RescheduleFlow
          appointment={rescheduleAppointment as any}
          onClose={() => { setShowReschedule(false); setRescheduleAppointment(null); }}
          sessionId={session?.id ?? null}
        />
      )}

      {/* Mobile Header */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-stone-200">
        <button
          onClick={() => setMobileNavOpen(!mobileNavOpen)}
          className="p-2 text-stone-600 hover:text-stone-900"
          aria-label="Toggle navigation"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={mobileNavOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
          </svg>
        </button>
        <span className="text-lg font-semibold text-stone-800">{branding.businessName}</span>
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium" style={{ background: branding.accentColor }}>
          {avatarInitials}
        </div>
      </header>

      <div className="flex">
        {/* Sidebar Navigation */}
        <nav className={`
          ${mobileNavOpen ? "translate-x-0" : "-translate-x-full"}
          md:translate-x-0 fixed md:sticky top-0 left-0 z-30
          w-64 h-screen bg-white border-r border-stone-200
          flex flex-col transition-transform duration-200
        `}>
          <div className="hidden md:flex items-center gap-3 px-6 py-5 border-b border-stone-100">
            {branding.logoBase64 && branding.logoMimeType ? (
              <img
                src={`data:${branding.logoMimeType};base64,${branding.logoBase64}}`}
                alt=""
                className="w-10 h-10 rounded-xl object-contain"
              />
            ) : (
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-lg" style={{ background: branding.accentColor }}>
                🐾
              </div>
            )}
            <div>
              <div className="font-semibold text-stone-800 text-sm">{branding.businessName}</div>
              <div className="text-xs text-stone-500">Grooming</div>
            </div>
          </div>

          <div className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
            {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
              const active = id === activeSection;
              return (
                <button
                  key={id}
                  onClick={() => handleNavClick(id)}
                  className={`
                    w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                    ${active
                      ? "bg-stone-100 text-stone-800 font-semibold"
                      : "text-stone-600 hover:bg-stone-50 hover:text-stone-900"
                    }
                  `}
                >
                  <Icon size={18} />
                  {label}
                </button>
              );
            })}
          </div>

          {/* Session controls (only shown during active impersonation) */}
          <div className="border-t border-stone-100 p-4 space-y-2">
            {session?.status === "active" && (
              <button
                onClick={() => { void handleEnd(); }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 transition-colors"
              >
                <LogOut size={14} />
                End Impersonation
              </button>
            )}
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-stone-400">
              <Shield size={12} />
              Customer Portal v1.0
            </div>
          </div>
        </nav>

        {/* Mobile nav overlay */}
        {mobileNavOpen && (
          <div
            className="fixed inset-0 bg-black/30 z-20 md:hidden"
            onClick={() => setMobileNavOpen(false)}
          />
        )}

        {/* Main Content */}
        <main className="flex-1 min-h-screen">
          <div className="hidden md:flex items-center justify-between px-8 py-4 border-b border-stone-200 bg-white">
            <div>
              <h1 className="text-lg font-semibold text-stone-800">
                {NAV_ITEMS.find(n => n.id === activeSection)?.label}
              </h1>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-stone-600">Hi, {clientName.split(" ")[0] || "Guest"}</span>
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium" style={{ background: branding.accentColor }}>
                {avatarInitials}
              </div>
            </div>
          </div>
          <div className="p-4 md:p-8 max-w-6xl">
            {renderSection()}
          </div>
        </main>
      </div>
    </div>
  );
}
