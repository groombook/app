import { getDevUser } from "../pages/DevLoginSelector.js";

const originalFetch = window.fetch;

/**
 * Patches global fetch to include X-Dev-User-Id header on API requests
 * when a dev user is selected via the login selector.
 *
 * Intentionally mutates window.fetch — this is dev-only (AUTH_DISABLED=true).
 */
export function installDevFetchInterceptor() {
  window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
    const user = getDevUser();
    if (!user) return originalFetch(input, init);

    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;

    // Only inject header for API calls
    if (!url.startsWith("/api/")) return originalFetch(input, init);

    const headers = new Headers(init?.headers);
    if (!headers.has("X-Dev-User-Id")) {
      headers.set("X-Dev-User-Id", user.id);
    }

    return originalFetch(input, { ...init, headers });
  };
}
