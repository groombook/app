import { Routes, Route, Link } from "react-router-dom";
import { AppointmentsPage } from "./pages/Appointments.js";
import { ClientsPage } from "./pages/Clients.js";
import { ServicesPage } from "./pages/Services.js";

export function App() {
  return (
    <div>
      <nav style={{ padding: "1rem", borderBottom: "1px solid #e2e8f0" }}>
        <strong style={{ marginRight: "1.5rem" }}>Groom Book</strong>
        <Link to="/" style={{ marginRight: "1rem" }}>
          Appointments
        </Link>
        <Link to="/clients" style={{ marginRight: "1rem" }}>
          Clients
        </Link>
        <Link to="/services">Services</Link>
      </nav>
      <main style={{ padding: "1rem" }}>
        <Routes>
          <Route path="/" element={<AppointmentsPage />} />
          <Route path="/clients" element={<ClientsPage />} />
          <Route path="/services" element={<ServicesPage />} />
        </Routes>
      </main>
    </div>
  );
}
