import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { getEnv } from "../config.js";

const ALGORITHM = "aes-256-gcm";

function getKey(): Buffer {
  return Buffer.from(getEnv().ENCRYPTION_KEY, "hex");
}

export function encrypt(plaintext: string): string {
  if (!plaintext || plaintext.length === 0) throw new Error("Cannot encrypt empty string");
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decrypt(payload: string): string {
  const key = getKey();
  const [ivHex, tagHex, dataHex] = payload.split(":");
  if (!ivHex || !tagHex || !dataHex) throw new Error("Invalid encrypted payload");

  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const data = Buffer.from(dataHex, "hex");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString("utf8");
}
