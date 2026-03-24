export function BookingErrorPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui, sans-serif",
        background: "#fef2f2",
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          padding: "2.5rem 3rem",
          boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
          textAlign: "center",
          maxWidth: 420,
        }}
      >
        <div style={{ fontSize: 56, marginBottom: "0.5rem" }}>⚠️</div>
        <h1 style={{ color: "#b91c1c", fontSize: 24, margin: "0 0 0.5rem" }}>
          Link Invalid or Expired
        </h1>
        <p style={{ color: "#4b5563", margin: "0 0 1.5rem" }}>
          This confirmation link is invalid, has already been used, or your
          appointment has already passed. Please contact us if you need help.
        </p>
        <a
          href="/"
          style={{
            display: "inline-block",
            padding: "0.6rem 1.5rem",
            background: "#dc2626",
            color: "#fff",
            borderRadius: 6,
            textDecoration: "none",
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          Back to Portal
        </a>
      </div>
    </div>
  );
}
