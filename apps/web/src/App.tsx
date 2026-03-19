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
          to="/admin/book"
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
            to === "/admin"
              ? location.pathname === "/admin"
              : location.pathname.startsWith(to);
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
