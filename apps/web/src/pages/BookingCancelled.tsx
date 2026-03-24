export function BookingCancelledPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui, sans-serif",
        background: "#fff7ed",
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
        <div style={{ fontSize: 56, marginBottom: "0.5rem" }}>✗</div>
        <h1 style={{ color: "#c2410c", fontSize: 24, margin: "0 0 0.5rem" }}>
          Appointment Cancelled
        </h1>
        <p style={{ color: "#4b5563", margin: "0 0 1.5rem" }}>
          Your appointment has been cancelled. If this was a mistake or you'd
          like to rebook, please contact us.
        </p>
        <a
          href="/"
          style={{
            display: "inline-block",
            padding: "0.6rem 1.5rem",
            background: "#ea580c",
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
