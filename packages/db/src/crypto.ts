import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit IV for GCM
const AUTH_TAG_LENGTH = 16; // 128-bit auth tag
const SALT_LENGTH = 16;

/**
 * Derives a 32-byte key from BETTER_AUTH_SECRET using scrypt.
 * BETTER_AUTH_SECRET is used as the password, with a fixed salt derived from the package name.
 */
function deriveKey(secret: string): Buffer {
  // Use a fixed salt derived from the package name for key derivation
  // This gives us stable key derivation without storing an extra salt
  const packageSalt = scryptSync("groombook-auth-provider-config", "", SALT_LENGTH);
  return scryptSync(secret, packageSalt, 32);
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Returns a base64-encoded string in the format: iv:ciphertext:authTag
 */
export function encryptSecret(plaintext: string): string {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) {
    throw new Error("BETTER_AUTH_SECRET environment variable is required");
  }

  const key = deriveKey(secret);
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  let ciphertext = cipher.update(plaintext, "utf8");
  ciphertext = Buffer.concat([ciphertext, cipher.final()]);

  const authTag = cipher.getAuthTag();

  // Format: base64(iv):base64(ciphertext):base64(authTag)
  return [
    iv.toString("base64"),
    ciphertext.toString("base64"),
    authTag.toString("base64"),
  ].join(":");
}

/**
 * Decrypts a ciphertext string produced by encryptSecret.
 * Expects the format: iv:ciphertext:authTag (all base64-encoded)
 */
export function decryptSecret(encrypted: string): string {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) {
    throw new Error("BETTER_AUTH_SECRET environment variable is required");
  }

  const parts = encrypted.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted value format: expected iv:ciphertext:authTag");
  }

  const ivBase64 = parts[0]!;
  const ciphertextBase64 = parts[1]!;
  const authTagBase64 = parts[2]!;
  const iv = Buffer.from(ivBase64, "base64");
  const ciphertext = Buffer.from(ciphertextBase64, "base64");
  const authTag = Buffer.from(authTagBase64, "base64");

  const key = deriveKey(secret);

  const decipher = createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  let plaintext = decipher.update(ciphertext);
  plaintext = Buffer.concat([plaintext, decipher.final()]);

  return plaintext.toString("utf8");
}