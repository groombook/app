import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

interface StaffUser {
  id: string;
  userId: string | null;
  name: string;
  email: string;
  role: string;
}

interface ClientUser {
  id: string;
  name: string;
  email: string | null;
  petCount: number;
}

export function DevLoginSelector() {
  const navigate = useNavigate();
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [clients, setClients] = useState<ClientUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dev/users")
      .then((r) => r.json())
      .then((data) => {
        setStaff(data.staff ?? []);
        setClients(data.clients ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  function selectUser(type: "staff" | "client", id: string, name: string) {
    localStorage.setItem("dev-user", JSON.stringify({ type, id, name }));
    navigate(type === "staff" ? "/admin" : "/");
  }

  function skipLogin() {
    localStorage.removeItem("dev-user");
    localStorage.setItem("dev-login-skipped", "1");
    navigate("/admin");
  }

  if (loading) {
    return (
      <div style={containerStyle}>
        <p style={{ color: "#6b7280" }}>Loading users...</p>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
          <h1 style={{ margin: 0, fontSize: 22, color: "#1a202c" }}>
            <span style={{ color: "#4f8a6f" }}>Groom</span>Book
          </h1>
          <p style={{ margin: "0.5rem 0 0", color: "#6b7280", fontSize: 14 }}>
            Dev Login Selector
          </p>
        </div>

        <h2 style={sectionStyle}>Staff</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {staff.map((s) => (
            <button
              key={s.id}
              onClick={() => selectUser("staff", s.userId ?? s.id, s.name)}
              style={userButtonStyle}
            >
              <div style={{ fontWeight: 600, fontSize: 14 }}>{s.name}</div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>
                {s.role} &middot; {s.email}
              </div>
            </button>
          ))}
        </div>

        <h2 style={{ ...sectionStyle, marginTop: "1.5rem" }}>Clients</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {clients.map((cl) => (
            <button
              key={cl.id}
              onClick={() => selectUser("client", cl.id, cl.name)}
              style={userButtonStyle}
            >
              <div style={{ fontWeight: 600, fontSize: 14 }}>{cl.name}</div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>
                {cl.petCount} pet{cl.petCount !== 1 ? "s" : ""}
                {cl.email ? ` \u00b7 ${cl.email}` : ""}
              </div>
            </button>
          ))}
        </div>

        <div style={{ marginTop: "1.5rem", textAlign: "center" }}>
          <button onClick={skipLogin} style={skipButtonStyle}>
            Continue as default dev user
          </button>
        </div>
      </div>
    </div>
  );
}

export function getDevUser(): { type: string; id: string; name: string } | null {
  try {
    const raw = localStorage.getItem("dev-user");
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearDevUser() {
  localStorage.removeItem("dev-user");
}

const containerStyle: React.CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontFamily: "system-ui, sans-serif",
  background: "#f0f2f5",
  padding: "1rem",
};

const cardStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 12,
  padding: "2rem",
  width: "100%",
  maxWidth: 420,
  boxShadow: "0 4px 12px rgba(0, 0, 0, 0.08)",
};

const sectionStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "#6b7280",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  margin: "0 0 0.5rem",
};

const userButtonStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: "0.75rem 1rem",
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  background: "#fff",
  cursor: "pointer",
  textAlign: "left",
  transition: "border-color 0.15s, background 0.15s",
};

const skipButtonStyle: React.CSSProperties = {
  padding: "0.5rem 1.25rem",
  border: "1px solid #d1d5db",
  borderRadius: 6,
  background: "transparent",
  cursor: "pointer",
  fontSize: 13,
  color: "#6b7280",
};
