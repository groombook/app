import { describe, it, expect } from "vitest";
import { generateIcalToken } from "../routes/calendar.js";

describe("generateIcalToken", () => {
  it("generates a 64-character hex token", () => {
    const token = generateIcalToken();
    expect(token).toHaveLength(64);
    expect(token).toMatch(/^[a-f0-9]+$/);
  });

  it("generates unique tokens", () => {
    const token1 = generateIcalToken();
    const token2 = generateIcalToken();
    expect(token1).not.toBe(token2);
  });
});