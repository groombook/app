import { Routes, Route, Link, useLocation } from "react-router-dom";
import { AppointmentsPage } from "./pages/Appointments.js";
import { ClientsPage } from "./pages/Clients.js";
import { ServicesPage } from "./pages/Services.js";
import { StaffPage } from "./pages/Staff.js";
import { InvoicesPage } from "./pages/Invoices.js";
import { BookPage } from "./pages/Book.js";
import { ReportsPage } from "./pages/Reports.js";
import { GroupBookingPage } from "./pages/GroupBooking.js";
import { CustomerPortal } from "./portal/CustomerPortal.js";

const NAV_LINKS = [
  { to: "/admin", label: "Appointments" },
  { to: "/admin/clients", label: "Clients" },
  { to: "/admin/services", label: "Services" },
  { to: "/admin/staff", label: "Staff" },
  { to: "/admin/invoices", label: "Invoices" },
  { to: "/admin/group-bookings", label: "Group Bookings" },
  { to: "/admin/reports", label: "Reports" },
  { to: "/", label: "Customer Portal" },
];

function AdminLayout() {
  const location = useLocation();
  return (
    <div style={{ minHeight: "100vh", fontFamily: "system-ui, sans-serif", background: "#f0f2f5" }}>
      <nav
        style={{
          padding: "0 1.25rem",
          height: 52,
          borderBottom: "1px solid #e2e8f0",
          display: "flex",
          alignItems: "center",
          gap: "0.25rem",
          background: "#fff",
          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04)",
          position: "sticky",
          top: 0,
          zIndex: 50,
        }}
      >
        <strong style={{
          marginRight: "1.25rem",
          fontSize: 17,
          color: "#1a202c",
          letterSpacing: "-0.02em",
        }}>
          <span style={{ color: "#4f8a6f" }}>Groom</span>Book
        </strong>
        <Link
          to="/admin/book"
          style={{
            padding: "0.4rem 0.85rem",
            borderRadius: 6,
            textDecoration: "none",
            fontSize: 13,
            fontWeight: 600,
            color: "#fff",
            background: "linear-gradient(135deg, #4f8a6f, #3d7a5f)",
            marginRight: "0.5rem",
            boxShadow: "0 1px 2px rgba(79, 138, 111, 0.3)",
          }}
        >
          Book
        </Link>
        {NAV_LINKS.map(({ to, label }) => {
          const active =
            to === "/admin"
              ? location.pathname === "/admin"
              : location.pathname.startsWith(to);
          return (
            <Link
              key={to}
              to={to}
              style={{
                padding: "0.4rem 0.75rem",
                borderRadius: 6,
                textDecoration: "none",
                fontSize: 13,
                fontWeight: active ? 600 : 500,
                color: active ? "#2d6a4f" : "#4b5563",
                background: active ? "#ecfdf5" : "transparent",
              }}
            >
              {label}
            </Link>
          );
        })}
      </nav>
      <main style={{ padding: "1.25rem 1.5rem" }}>
        <Routes>
          <Route path="/" element={<AppointmentsPage />} />
          <Route path="/clients" element={<ClientsPage />} />
          <Route path="/services" element={<ServicesPage />} />
          <Route path="/staff" element={<StaffPage />} />
          <Route path="/invoices" element={<InvoicesPage />} />
          <Route path="/book" element={<BookPage />} />
          <Route path="/group-bookings" element={<GroupBookingPage />} />
          <Route path="/reports" element={<ReportsPage />} />
        </Routes>
      </main>
    </div>
  );
}

export function App() {
  const location = useLocation();

  if (location.pathname.startsWith("/admin")) {
    return (
      <Routes>
        <Route path="/admin/*" element={<AdminLayout />} />
      </Routes>
    );
  }

  return <CustomerPortal />;
}
