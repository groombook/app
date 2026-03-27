import { useState, useEffect } from "react";
import { Calendar, RefreshCw, Trash2, Copy, Check } from "lucide-react";

interface Props {
  staffId: string;
  staffName: string;
}

export function CalendarSyncSection({ staffId }: Props) {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<"generate" | "revoke" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showRevokeConfirm, setShowRevokeConfirm] = useState(false);

  useEffect(() => {
    fetchToken();
  }, [staffId]);

  async function fetchToken() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/staff/${staffId}`);
      if (!res.ok) throw new Error("Failed to fetch staff data");
      const data = await res.json();
      setToken(data.icalToken || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  async function generateToken() {
    setActionLoading("generate");
    setError(null);
    try {
      const res = await fetch(`/api/staff/${staffId}/ical-token`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to generate token");
      }
      const data = await res.json();
      setToken(data.icalToken);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate token");
    } finally {
      setActionLoading(null);
    }
  }

  async function revokeToken() {
    if (!showRevokeConfirm) {
      setShowRevokeConfirm(true);
      return;
    }
    setActionLoading("revoke");
    setError(null);
    try {
      const res = await fetch(`/api/staff/${staffId}/ical-token`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to revoke token");
      }
      setToken(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to revoke token");
    } finally {
      setActionLoading(null);
      setShowRevokeConfirm(false);
    }
  }

  async function copyFeedUrl() {
    if (!token) return;
    const url = `${window.location.origin}/api/calendar/${staffId}.ics?token=${token}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const feedUrl = token ? `/api/calendar/${staffId}.ics?token=${token}` : null;

  return (
    <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <Calendar size={18} className="text-(--color-accent)" />
        <h3 className="font-medium text-stone-800">Calendar Sync</h3>
      </div>

      <p className="text-sm text-stone-500 mb-4">
        Generate a calendar feed link to share your upcoming appointments with any calendar app that supports iCal (Apple Calendar, Google Calendar, Outlook).
      </p>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-stone-400">Loading...</div>
      ) : token ? (
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1">Your Calendar Feed URL</label>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={feedUrl ?? ""}
                className="flex-1 text-sm border border-stone-200 rounded-lg px-3 py-2 bg-stone-50 text-stone-600 font-mono"
              />
              <button
                onClick={copyFeedUrl}
                className="flex items-center gap-1.5 px-3 py-2 border border-stone-200 rounded-lg text-sm text-stone-600 hover:bg-stone-50"
                title="Copy link"
              >
                {copied ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
              </button>
            </div>
          </div>

          {showRevokeConfirm ? (
            <div className="flex items-center gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="flex-1 text-sm text-red-700">
                Revoke your calendar feed link? Anyone with the current link will lose access.
              </p>
              <button
                onClick={revokeToken}
                disabled={actionLoading !== null}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
              >
                {actionLoading === "revoke" ? (
                  <RefreshCw size={14} className="animate-spin" />
                ) : (
                  <Trash2 size={14} />
                )}
                Revoke
              </button>
              <button
                onClick={() => setShowRevokeConfirm(false)}
                disabled={actionLoading !== null}
                className="px-3 py-1.5 border border-stone-200 rounded-lg text-sm text-stone-600 hover:bg-stone-50 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={generateToken}
                disabled={actionLoading !== null}
                className="flex items-center gap-1.5 px-3 py-2 bg-(--color-accent) text-white rounded-lg text-sm font-medium hover:bg-(--color-accent-hover) disabled:opacity-50"
              >
                {actionLoading === "generate" ? (
                  <RefreshCw size={14} className="animate-spin" />
                ) : (
                  <RefreshCw size={14} />
                )}
                Regenerate
              </button>
              <button
                onClick={revokeToken}
                disabled={actionLoading !== null}
                className="flex items-center gap-1.5 px-3 py-2 border border-red-200 rounded-lg text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                {actionLoading === "revoke" ? (
                  <RefreshCw size={14} className="animate-spin" />
                ) : (
                  <Trash2 size={14} />
                )}
                Revoke
              </button>
            </div>
          )}

          <p className="text-xs text-stone-400">
            Regenerating will create a new URL and invalidate the old one.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-stone-600">You don&apos;t have a calendar feed set up yet.</p>
          <button
            onClick={generateToken}
            disabled={actionLoading !== null}
            className="flex items-center gap-1.5 px-4 py-2 bg-(--color-accent) text-white rounded-lg text-sm font-medium hover:bg-(--color-accent-hover) disabled:opacity-50"
          >
            {actionLoading === "generate" ? (
              <RefreshCw size={14} className="animate-spin" />
            ) : (
              <Calendar size={14} />
            )}
            {actionLoading === "generate" ? "Generating..." : "Generate Calendar Feed"}
          </button>
        </div>
      )}
    </div>
  );
}