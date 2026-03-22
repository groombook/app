import { useState, useEffect } from "react";
import { Eye, Clock, LogOut, FileSearch } from "lucide-react";
import type { ImpersonationSession } from "@groombook/types";

interface Props {
  session: ImpersonationSession;
  isExtended: boolean;
  onEnd: () => void;
  onExtend: () => void;
  onShowAudit: () => void;
}

export function ImpersonationBanner({ session, isExtended, onEnd, onExtend, onShowAudit }: Props) {
  const [remaining, setRemaining] = useState("");
  const [showWarning, setShowWarning] = useState(false);

  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      const expires = new Date(session.expiresAt).getTime();
      const diff = expires - now;
      if (diff <= 0) {
        setRemaining("Expired");
        onEnd();
        return;
      }
      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setRemaining(`${mins}:${secs.toString().padStart(2, "0")}`);
      setShowWarning(mins < 5);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [session.expiresAt, onEnd]);

  return (
    <div data-testid="impersonation-banner" className="sticky top-0 z-40 bg-amber-500 text-amber-950 px-4 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-medium shadow-md">
      <span className="flex items-center gap-1.5">
        <Eye size={16} />
        STAFF VIEW
      </span>
      {session.reason && (
        <span className="hidden md:inline text-amber-800 text-xs">
          Reason: {session.reason}
        </span>
      )}
      <span className="hidden sm:inline text-amber-800 text-xs">
        Started {new Date(session.startedAt).toLocaleTimeString()}
      </span>
      <div className="flex items-center gap-2 ml-auto">
        <span className={`flex items-center gap-1 text-xs ${showWarning ? "text-red-800 font-bold animate-pulse" : "text-amber-800"}`}>
          <Clock size={14} />
          {remaining}
        </span>
        {showWarning && !isExtended && (
          <button
            onClick={onExtend}
            className="px-2 py-1 text-xs bg-amber-600 text-white rounded hover:bg-amber-700"
          >
            Extend
          </button>
        )}
        <button
          onClick={onShowAudit}
          className="px-2 py-1 text-xs bg-amber-100 text-amber-800 rounded hover:bg-amber-200 flex items-center gap-1"
        >
          <FileSearch size={12} />
          Audit
        </button>
        <button
          onClick={onEnd}
          className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 flex items-center gap-1"
        >
          <LogOut size={12} />
          End Session
        </button>
      </div>
    </div>
  );
}
