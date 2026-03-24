export function BookingConfirmedPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui, sans-serif",
        background: "#f0fdf4",
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
        <div style={{ fontSize: 56, marginBottom: "0.5rem" }}>✓</div>
        <h1 style={{ color: "#15803d", fontSize: 24, margin: "0 0 0.5rem" }}>
          Appointment Confirmed
        </h1>
        <p style={{ color: "#4b5563", margin: "0 0 1.5rem" }}>
          Thank you! Your appointment is confirmed. We look forward to seeing you
          and your furry friend.
        </p>
        <a
          href="/"
          style={{
            display: "inline-block",
            padding: "0.6rem 1.5rem",
            background: "#16a34a",
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
