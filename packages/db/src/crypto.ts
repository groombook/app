import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit IV for GCM
const AUTH_TAG_LENGTH = 16; // 128-bit auth tag
const SALT_LENGTH = 16;

/**
 * Legacy fixed salt used for backward-compatible decryption of pre-salt format values.
 * Do not use for new encryptions.
 */
const LEGACY_PACKAGE_SALT = scryptSync("groombook-auth-provider-config", "", SALT_LENGTH);

/**
 * Derives a 32-byte key from BETTER_AUTH_SECRET using scrypt.
 * Uses the provided salt (random per encryption for new values).
 */
function deriveKey(secret: string, salt: Buffer): Buffer {
  return scryptSync(secret, salt, 32);
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Returns a base64-encoded string in the format: salt:iv:ciphertext:authTag
 */
export function encryptSecret(plaintext: string): string {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) {
    throw new Error("BETTER_AUTH_SECRET environment variable is required");
  }

  const salt = randomBytes(SALT_LENGTH);
  const key = deriveKey(secret, salt);
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  let ciphertext = cipher.update(plaintext, "utf8");
  ciphertext = Buffer.concat([ciphertext, cipher.final()]);

  const authTag = cipher.getAuthTag();

  // Format: base64(salt):base64(iv):base64(ciphertext):base64(authTag)
  return [
    salt.toString("base64"),
    iv.toString("base64"),
    ciphertext.toString("base64"),
    authTag.toString("base64"),
  ].join(":");
}

/**
 * Decrypts a ciphertext string produced by encryptSecret.
 * Supports both new format (salt:iv:ciphertext:authTag) and legacy format (iv:ciphertext:authTag).
 * All values are base64-encoded.
 */
export function decryptSecret(encrypted: string): string {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) {
    throw new Error("BETTER_AUTH_SECRET environment variable is required");
  }

  const parts = encrypted.split(":");
  if (parts.length !== 3 && parts.length !== 4) {
    throw new Error("Invalid encrypted value format: expected salt:iv:ciphertext:authTag or iv:ciphertext:authTag");
  }

  let salt: Buffer;
  let iv: Buffer;
  let ciphertext: Buffer;
  let authTag: Buffer;

  if (parts.length === 4) {
    // New format: salt:iv:ciphertext:authTag
    salt = Buffer.from(parts[0]!, "base64");
    iv = Buffer.from(parts[1]!, "base64");
    ciphertext = Buffer.from(parts[2]!, "base64");
    authTag = Buffer.from(parts[3]!, "base64");
  } else {
    // Legacy format: iv:ciphertext:authTag — use fixed package salt
    salt = LEGACY_PACKAGE_SALT;
    iv = Buffer.from(parts[0]!, "base64");
    ciphertext = Buffer.from(parts[1]!, "base64");
    authTag = Buffer.from(parts[2]!, "base64");
  }

  const key = deriveKey(secret, salt);

  const decipher = createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  let plaintext = decipher.update(ciphertext);
  plaintext = Buffer.concat([plaintext, decipher.final()]);

  return plaintext.toString("utf8");
}