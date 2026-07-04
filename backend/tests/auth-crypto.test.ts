import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

vi.mock("../src/config.js", () => ({
  getEnv: () => ({
    GITLAB_BASE_URL: "https://gitlab.example.com/api/v4",
    REQUEST_TIMEOUT: 5000,
    RATE_LIMIT_RPS: 100,
    CACHE_TTL: 300,
    DATABASE_URL: "postgresql://test:test@localhost:5432/test",
    JWT_SECRET: "test-secret-1234567890",
    ENCRYPTION_KEY: "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff",
  }),
}));

import { encrypt, decrypt } from "../src/utils/crypto.js";
import { signToken, verifyToken } from "../src/utils/auth.js";

describe("crypto encrypt/decrypt", () => {
  it("roundtrips a string", () => {
    const plaintext = "my-secret-token-12345";
    const enc = encrypt(plaintext);
    expect(enc).not.toBe(plaintext);
    expect(decrypt(enc)).toBe(plaintext);
  });

  it("produces different ciphertext each time (random IV)", () => {
    const a = encrypt("hello");
    const b = encrypt("hello");
    expect(a).not.toBe(b);
  });

  it("throws on empty string", () => {
    expect(() => encrypt("")).toThrow("Cannot encrypt empty string");
  });

  it("throws on invalid payload", () => {
    expect(() => decrypt("invalid")).toThrow("Invalid encrypted payload");
  });
});

describe("auth signToken/verifyToken", () => {
  it("roundtrips a JWT payload", () => {
    const payload = { userId: 1, username: "admin", role: "admin" as const };
    const token = signToken(payload);
    const decoded = verifyToken(token);
    expect(decoded.userId).toBe(1);
    expect(decoded.username).toBe("admin");
    expect(decoded.role).toBe("admin");
  });

  it("throws on invalid token", () => {
    expect(() => verifyToken("invalid.token.here")).toThrow();
  });
});
