import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGO     = "aes-256-gcm";
const KEY_LEN  = 32;
const IV_LEN   = 12;
const TAG_LEN  = 16;

function loadKey(): Buffer {
  const raw = process.env.REPORTS_ENCRYPTION_KEY;
  if (!raw) throw new Error("REPORTS_ENCRYPTION_KEY is not set");
  const key = Buffer.from(raw, "base64");
  if (key.length !== KEY_LEN) {
    throw new Error(
      `REPORTS_ENCRYPTION_KEY must be base64-encoded ${KEY_LEN} bytes (got ${key.length})`,
    );
  }
  return key;
}

export function encryptSecret(plaintext: string): string {
  const key    = loadKey();
  const iv     = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct     = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag    = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString("base64");
}

export function decryptSecret(encoded: string): string {
  const key  = loadKey();
  const buf  = Buffer.from(encoded, "base64");
  if (buf.length < IV_LEN + TAG_LEN + 1) {
    throw new Error("Ciphertext is too short");
  }
  const iv   = buf.subarray(0, IV_LEN);
  const tag  = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ct   = buf.subarray(IV_LEN + TAG_LEN);
  const dec  = createDecipheriv(ALGO, key, iv);
  dec.setAuthTag(tag);
  return Buffer.concat([dec.update(ct), dec.final()]).toString("utf8");
}

export function last4(secret: string): string {
  return secret.slice(-4);
}
