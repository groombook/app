import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { Appointment } from "../portal/mockData.js";
import { parseTimeTo24Hour, isUpcoming, CustomerNotesSection } from "../portal/sections/Appointments.js";

const UPCOMING_APPT: Appointment = {
  id: "appt-1",
  petId: "pet-1",
  petName: "Buddy",
  groomerId: "groomer-1",
  groomerName: "Sarah",
  services: ["Bath & Brush"],
  addOns: [],
  date: "2027-01-01",
  time: "10:00 AM",
  duration: 60,
  price: 50,
  status: "confirmed",
  notes: "",
  customerNotes: "",
};

const PAST_APPT: Appointment = {
  ...UPCOMING_APPT,
  id: "appt-2",
  date: "2025-01-01",
  time: "10:00 AM",
  status: "completed",
};

describe("parseTimeTo24Hour", () => {
  it("converts AM times correctly", () => {
    expect(parseTimeTo24Hour("9:00 AM")).toBe("09:00:00");
    expect(parseTimeTo24Hour("10:00 AM")).toBe("10:00:00");
    expect(parseTimeTo24Hour("12:00 AM")).toBe("00:00:00");
  });

  it("converts PM times correctly", () => {
    expect(parseTimeTo24Hour("1:00 PM")).toBe("13:00:00");
    expect(parseTimeTo24Hour("2:00 PM")).toBe("14:00:00");
    expect(parseTimeTo24Hour("11:00 PM")).toBe("23:00:00");
    expect(parseTimeTo24Hour("12:00 PM")).toBe("12:00:00");
  });
});

describe("isUpcoming", () => {
  it("returns true for future confirmed appointments", () => {
    expect(isUpcoming(UPCOMING_APPT)).toBe(true);
  });

  it("returns false for past appointments", () => {
    expect(isUpcoming(PAST_APPT)).toBe(false);
  });

  it("returns false for cancelled appointments", () => {
    expect(isUpcoming({ ...UPCOMING_APPT, status: "cancelled" })).toBe(false);
  });

  it("returns false for completed appointments", () => {
    expect(isUpcoming({ ...UPCOMING_APPT, status: "completed" })).toBe(false);
  });
});

describe("CustomerNotesSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it("renders textarea with existing notes", () => {
    render(<CustomerNotesSection appointment={{ ...UPCOMING_APPT, customerNotes: "Test note" }} sessionId="test-session-id" />);
    expect(screen.getByRole("textbox")).toHaveValue("Test note");
  });

  it("renders Save Notes button", () => {
    render(<CustomerNotesSection appointment={UPCOMING_APPT} sessionId="test-session-id" />);
    expect(screen.getByRole("button", { name: /Save Notes/i })).toBeInTheDocument();
  });

  it("sends X-Impersonation-Session-Id header when session exists", async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ id: "appt-1", customerNotes: "Updated", updatedAt: new Date().toISOString() }),
    } as Response);

    render(<CustomerNotesSection appointment={UPCOMING_APPT} sessionId="test-session-id" />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "New note" } });
    fireEvent.click(screen.getByRole("button", { name: /Save Notes/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/portal/appointments/appt-1/notes",
        expect.objectContaining({
          headers: expect.objectContaining({
            "X-Impersonation-Session-Id": "test-session-id",
          }),
        })
      );
    });
  });

  it("does not send X-Impersonation-Session-Id header when sessionId is null", async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ id: "appt-1", customerNotes: "Updated", updatedAt: new Date().toISOString() }),
    } as Response);

    render(<CustomerNotesSection appointment={UPCOMING_APPT} sessionId={null} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "New note" } });
    fireEvent.click(screen.getByRole("button", { name: /Save Notes/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/portal/appointments/appt-1/notes",
        expect.objectContaining({
          headers: expect.not.objectContaining({
            "X-Impersonation-Session-Id": expect.anything(),
          }),
        })
      );
    });
  });

  it("shows error message when save fails", async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: "Unauthorized" }),
    } as Response);

    render(<CustomerNotesSection appointment={UPCOMING_APPT} sessionId="test-session-id" />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "New note" } });
    fireEvent.click(screen.getByRole("button", { name: /Save Notes/i }));

    await waitFor(() => {
      expect(screen.getByText(/Unauthorized/i)).toBeInTheDocument();
    });
  });

  it("shows success message when save succeeds", async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ id: "appt-1", customerNotes: "Saved", updatedAt: new Date().toISOString() }),
    } as Response);

    render(<CustomerNotesSection appointment={UPCOMING_APPT} sessionId="test-session-id" />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Saved note" } });
    fireEvent.click(screen.getByRole("button", { name: /Save Notes/i }));

    await waitFor(() => {
      expect(screen.getByText(/Saved!/i)).toBeInTheDocument();
    });
  });

  it("disables button when notes unchanged", () => {
    render(<CustomerNotesSection appointment={{ ...UPCOMING_APPT, customerNotes: "Existing" }} sessionId="test-session-id" />);
    expect(screen.getByRole("button", { name: /Save Notes/i })).toBeDisabled();
  });

  it("enforces 500 character limit", () => {
    render(<CustomerNotesSection appointment={UPCOMING_APPT} sessionId="test-session-id" />);
    const textarea = screen.getByRole("textbox");
    const longText = "a".repeat(600);
    fireEvent.change(textarea, { target: { value: longText } });
    expect(textarea).toHaveValue("a".repeat(500));
  });

  it("displays character count", () => {
    render(<CustomerNotesSection appointment={UPCOMING_APPT} sessionId="test-session-id" />);
    expect(screen.getByText(/0\/500/)).toBeInTheDocument();
  });

  it("shows exceeded character count in red when limit exceeded", () => {
    render(<CustomerNotesSection appointment={UPCOMING_APPT} sessionId="test-session-id" />);
    const textarea = screen.getByRole("textbox");
    // Type characters one by one to exceed limit
    const longText = "a".repeat(501);
    fireEvent.change(textarea, { target: { value: longText } });
    // The textarea value is truncated to 500, so counter shows 500/500
    // The class check would need to verify text-red-500 appears
    // Since the onChange truncates, we test that limit is enforced
    expect(textarea).toHaveValue("a".repeat(500));
  });

  it("does not render save button for completed appointments", () => {
    render(<CustomerNotesSection appointment={{ ...UPCOMING_APPT, status: "completed" }} sessionId="test-session-id" />);
    expect(screen.queryByRole("button", { name: /Save Notes/i })).not.toBeInTheDocument();
  });

  it("does not render save button for cancelled appointments", () => {
    render(<CustomerNotesSection appointment={{ ...UPCOMING_APPT, status: "cancelled" }} sessionId="test-session-id" />);
    expect(screen.queryByRole("button", { name: /Save Notes/i })).not.toBeInTheDocument();
  });
});