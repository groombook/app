import { Link } from "react-router-dom";
import { getDevUser } from "../pages/DevLoginSelector.js";

export function DevSessionIndicator() {
  const user = getDevUser();
  if (!user) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        background: "#1a202c",
        color: "#e2e8f0",
        padding: "0.4rem 1rem",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.75rem",
        fontSize: 12,
        zIndex: 9999,
      }}
    >
      <span>
        Dev mode: acting as <strong>{user.name}</strong> ({user.type})
      </span>
      <Link
        to="/login"
        style={{
          color: "var(--color-primary)",
          textDecoration: "underline",
          fontSize: 12,
        }}
      >
        Switch user
      </Link>
    </div>
  );
}
