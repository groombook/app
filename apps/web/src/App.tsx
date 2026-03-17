import { Routes, Route, Link, useLocation } from "react-router-dom";
import { AppointmentsPage } from "./pages/Appointments.js";
import { ClientsPage } from "./pages/Clients.js";
import { ServicesPage } from "./pages/Services.js";
import { StaffPage } from "./pages/Staff.js";
import { InvoicesPage } from "./pages/Invoices.js";
import { BookPage } from "./pages/Book.js";

const NAV_LINKS = [
  { to: "/", label: "Appointments" },
  { to: "/clients", label: "Clients" },
  { to: "/services", label: "Services" },
  { to: "/staff", label: "Staff" },
  { to: "/invoices", label: "Invoices" },
];

export function App() {
  const location = useLocation();
  return (
    <div style={{ minHeight: "100vh", fontFamily: "system-ui, sans-serif" }}>
      <nav
        style={{
          padding: "0.75rem 1rem",
          borderBottom: "1px solid #e2e8f0",
          display: "flex",
          alignItems: "center",
          gap: "0.25rem",
          background: "#fff",
        }}
      >
        <strong style={{ marginRight: "1rem", fontSize: 16 }}>Groom Book</strong>
        <Link
          to="/book"
          style={{
            padding: "0.35rem 0.75rem",
            borderRadius: 4,
            textDecoration: "none",
            fontSize: 14,
            fontWeight: 600,
            color: "#fff",
            background: "#4f8a6f",
            marginRight: "0.5rem",
          }}
        >
          Book
        </Link>
        {NAV_LINKS.map(({ to, label }) => {
          const active =
            to === "/" ? location.pathname === "/" : location.pathname.startsWith(to);
          return (
            <Link
              key={to}
              to={to}
              style={{
                padding: "0.35rem 0.75rem",
                borderRadius: 4,
                textDecoration: "none",
                fontSize: 14,
                fontWeight: active ? 600 : 400,
                color: active ? "#1d4ed8" : "#374151",
                background: active ? "#eff6ff" : "transparent",
              }}
            >
              {label}
            </Link>
          );
        })}
      </nav>
      <main style={{ padding: "1rem 1.5rem" }}>
        <Routes>
          <Route path="/" element={<AppointmentsPage />} />
          <Route path="/clients" element={<ClientsPage />} />
          <Route path="/services" element={<ServicesPage />} />
          <Route path="/staff" element={<StaffPage />} />
          <Route path="/invoices" element={<InvoicesPage />} />
          <Route path="/book" element={<BookPage />} />
        </Routes>
      </main>
    </div>
  );
}
