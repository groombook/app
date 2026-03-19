import { useState, useReducer, useCallback, useEffect } from "react";
import {
  Home, Calendar, PawPrint, FileText, CreditCard, MessageSquare,
  Settings, Eye, LogOut, Clock, Shield,
} from "lucide-react";
import { Dashboard } from "./sections/Dashboard.js";
import { AppointmentsSection } from "./sections/Appointments.js";
import { PetProfiles } from "./sections/PetProfiles.js";
import { ReportCards } from "./sections/ReportCards.js";
import { BillingPayments } from "./sections/BillingPayments.js";
import { Communication } from "./sections/Communication.js";
import { AccountSettings } from "./sections/AccountSettings.js";
import { ImpersonationBanner } from "./ImpersonationBanner.js";
import { AuditLogViewer } from "./AuditLogViewer.js";
import type { ImpersonationSession, AuditEntry } from "./mockData.js";
import { CUSTOMER } from "./mockData.js";
import { useBranding } from "../BrandingContext.js";

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

type ImpersonationAction =
  | { type: "START"; staffName: string; staffRole: string; reason: string }
  | { type: "END" }
  | { type: "EXTEND" }
  | { type: "LOG"; entry: AuditEntry };

function impersonationReducer(
  state: ImpersonationSession | null,
  action: ImpersonationAction
): ImpersonationSession | null {
  switch (action.type) {
    case "START": {
      const now = new Date();
      const expires = new Date(now.getTime() + 30 * 60 * 1000);
      return {
        active: true,
        staffName: action.staffName,
        staffRole: action.staffRole,
        customerName: CUSTOMER.name,
        reason: action.reason,
        startedAt: now.toISOString(),
        expiresAt: expires.toISOString(),
        extended: false,
        readOnly: true,
        auditLog: [{
          id: "audit-0",
          timestamp: now.toISOString(),
          action: "session_start",
          detail: `Impersonation started by ${action.staffName} (${action.staffRole}). Reason: ${action.reason}`,
        }],
      };
    }
    case "END":
      if (!state) return null;
      return {
        ...state,
        active: false,
        auditLog: [...state.auditLog, {
          id: `audit-${state.auditLog.length}`,
          timestamp: new Date().toISOString(),
          action: "session_end",
          detail: "Impersonation session ended",
        }],
      };
    case "EXTEND":
      if (!state) return null;
      return {
        ...state,
        expiresAt: new Date(new Date(state.expiresAt).getTime() + 30 * 60 * 1000).toISOString(),
        extended: true,
        auditLog: [...state.auditLog, {
          id: `audit-${state.auditLog.length}`,
          timestamp: new Date().toISOString(),
          action: "session_extended",
          detail: "Session extended by 30 minutes",
        }],
      };
    case "LOG":
      if (!state) return null;
      return { ...state, auditLog: [...state.auditLog, action.entry] };
    default:
      return state;
  }
}

export function CustomerPortal() {
  const [activeSection, setActiveSection] = useState<Section>("dashboard");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [showAuditLog, setShowAuditLog] = useState(false);
  const [showImpersonationSetup, setShowImpersonationSetup] = useState(false);
  const [impersonation, dispatchImpersonation] = useReducer(impersonationReducer, null);
  const { branding } = useBranding();

  // Auto-start impersonation from URL params (staff flow from admin panel).
  // Runs once on mount only — impersonation state is managed by the reducer after init.
  const [impersonationInitDone, setImpersonationInitDone] = useState(false);
  useEffect(() => {
    if (impersonationInitDone) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("impersonate") === "true") {
      const clientName = params.get("clientName") || "Unknown Customer";
      const reason = params.get("reason") || `Viewing portal as ${clientName}`;
      const staffName = params.get("staffName") || "Staff";
      dispatchImpersonation({
        type: "START",
        staffName,
        staffRole: "Admin",
        reason,
      });
      window.history.replaceState({}, "", window.location.pathname);
    }
    setImpersonationInitDone(true);
  }, [impersonationInitDone]);

  const logPageView = useCallback((page: string) => {
    if (impersonation?.active) {
      dispatchImpersonation({
        type: "LOG",
        entry: {
          id: `audit-${Date.now()}`,
          timestamp: new Date().toISOString(),
          action: "page_view",
          detail: `Viewed: ${page}`,
        },
      });
    }
  }, [impersonation?.active]);

  const handleNavClick = (section: Section) => {
    setActiveSection(section);
    setMobileNavOpen(false);
    logPageView(section);
  };

  const isReadOnly = impersonation?.active && impersonation.readOnly;

  const renderSection = () => {
    switch (activeSection) {
      case "dashboard":
        return <Dashboard onNavigate={handleNavClick} readOnly={!!isReadOnly} />;
      case "appointments":
        return <AppointmentsSection readOnly={!!isReadOnly} />;
      case "pets":
        return <PetProfiles readOnly={!!isReadOnly} />;
      case "reports":
        return <ReportCards />;
      case "billing":
        return <BillingPayments readOnly={!!isReadOnly} />;
      case "messages":
        return <Communication readOnly={!!isReadOnly} />;
      case "settings":
        return <AccountSettings readOnly={!!isReadOnly} />;
    }
  };

  return (
    <div
      className="min-h-screen bg-[#faf8f5] font-sans"
      style={impersonation?.active ? { border: "3px solid #f59e0b" } : undefined}
    >
      {impersonation?.active && (
        <>
          <ImpersonationBanner
            session={impersonation}
            onEnd={() => dispatchImpersonation({ type: "END" })}
            onExtend={() => dispatchImpersonation({ type: "EXTEND" })}
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

      {showAuditLog && impersonation && (
        <AuditLogViewer
          auditLog={impersonation.auditLog}
          onClose={() => setShowAuditLog(false)}
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
          SM
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
                src={`data:${branding.logoMimeType};base64,${branding.logoBase64}`}
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

          {/* Demo Controls */}
          <div className="border-t border-stone-100 p-4 space-y-2">
            {!impersonation?.active ? (
              <button
                onClick={() => setShowImpersonationSetup(true)}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 transition-colors"
              >
                <Eye size={14} />
                Demo: Staff Impersonation
              </button>
            ) : (
              <button
                onClick={() => dispatchImpersonation({ type: "END" })}
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
              <span className="text-sm text-stone-600">Hi, {CUSTOMER.name.split(" ")[0]}</span>
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium" style={{ background: branding.accentColor }}>
                SM
              </div>
            </div>
          </div>
          <div className="p-4 md:p-8 max-w-6xl">
            {renderSection()}
          </div>
        </main>
      </div>

      {/* Impersonation Setup Modal */}
      {showImpersonationSetup && <ImpersonationSetupModal
        onStart={(reason) => {
          dispatchImpersonation({ type: "START", staffName: "Chris", staffRole: "Admin", reason });
          setShowImpersonationSetup(false);
        }}
        onCancel={() => setShowImpersonationSetup(false)}
      />}
    </div>
  );
}

function ImpersonationSetupModal({ onStart, onCancel }: { onStart: (reason: string) => void; onCancel: () => void }) {
  const [reason, setReason] = useState("");
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
            <Eye size={20} className="text-amber-700" />
          </div>
          <div>
            <h2 className="font-semibold text-stone-800">Start Staff Impersonation</h2>
            <p className="text-sm text-stone-500">View portal as {CUSTOMER.name}</p>
          </div>
        </div>
        <div className="mb-4">
          <label className="block text-sm font-medium text-stone-700 mb-1">
            Reason for impersonation <span className="text-red-500">*</span>
          </label>
          <textarea
            className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
            rows={3}
            placeholder="e.g., Customer reports they can't see their upcoming appointment"
            value={reason}
            onChange={e => setReason(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-amber-50 rounded-lg">
          <Clock size={14} className="text-amber-600" />
          <span className="text-xs text-amber-700">Session will auto-expire after 30 minutes</span>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 border border-stone-300 rounded-lg text-sm font-medium text-stone-700 hover:bg-stone-50"
          >
            Cancel
          </button>
          <button
            onClick={() => reason.trim() && onStart(reason.trim())}
            disabled={!reason.trim()}
            className="flex-1 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Start Session
          </button>
        </div>
      </div>
    </div>
  );
}
