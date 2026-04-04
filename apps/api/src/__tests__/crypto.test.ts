import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { encryptSecret, decryptSecret } from "@groombook/db";

describe("encryptSecret / decryptSecret", () => {
  const originalEnv = process.env.BETTER_AUTH_SECRET;

  beforeEach(() => {
    process.env.BETTER_AUTH_SECRET = "test-secret-key-for-unit-tests-32bytes!";
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.BETTER_AUTH_SECRET = originalEnv;
    } else {
      delete process.env.BETTER_AUTH_SECRET;
    }
  });

  it("encrypts and decrypts a simple secret", () => {
    const plaintext = "my-client-secret-123";
    const encrypted = encryptSecret(plaintext);
    const decrypted = decryptSecret(encrypted);

    expect(decrypted).toBe(plaintext);
  });

  it("produces output in salt:iv:ciphertext:authTag format", () => {
    const encrypted = encryptSecret("test");
    const parts = encrypted.split(":");

    expect(parts).toHaveLength(4);
    // Each part should be valid base64
    parts.forEach((part) => {
      expect(() => Buffer.from(part, "base64")).not.toThrow();
    });
  });

  it("different plaintexts produce different ciphertexts", () => {
    const encrypted1 = encryptSecret("secret1");
    const encrypted2 = encryptSecret("secret2");

    expect(encrypted1).not.toBe(encrypted2);
  });

  it("same plaintext produces different ciphertexts (due to random IV)", () => {
    const encrypted1 = encryptSecret("same-secret");
    const encrypted2 = encryptSecret("same-secret");

    expect(encrypted1).not.toBe(encrypted2);
    // But both should decrypt to the same value
    expect(decryptSecret(encrypted1)).toBe("same-secret");
    expect(decryptSecret(encrypted2)).toBe("same-secret");
  });

  it("throws if BETTER_AUTH_SECRET is not set", () => {
    delete process.env.BETTER_AUTH_SECRET;

    expect(() => encryptSecret("test")).toThrow(
      "BETTER_AUTH_SECRET environment variable is required"
    );
  });

  it("throws when decrypting invalid format (wrong number of parts)", () => {
    const encrypted = encryptSecret("test");
    // Replace the last two parts with a single part to create a 2-part string
    // This can't be parsed as either legacy (3 parts) or new (4 parts) format
    const invalid = encrypted.replace(/:[^:]+$/, "").replace(/:[^:]+$/, "");

    expect(() => decryptSecret(invalid)).toThrow(
      "Invalid encrypted value format: expected salt:iv:ciphertext:authTag or iv:ciphertext:authTag"
    );
  });

  it("handles empty string secret", () => {
    const plaintext = "";
    const encrypted = encryptSecret(plaintext);
    const decrypted = decryptSecret(encrypted);

    expect(decrypted).toBe(plaintext);
  });

  it("handles unicode secret", () => {
    const plaintext = "密码🔐中文";
    const encrypted = encryptSecret(plaintext);
    const decrypted = decryptSecret(encrypted);

    expect(decrypted).toBe(plaintext);
  });

  it("handles long secret", () => {
    const plaintext = "a".repeat(10000);
    const encrypted = encryptSecret(plaintext);
    const decrypted = decryptSecret(encrypted);

    expect(decrypted).toBe(plaintext);
  });
});
