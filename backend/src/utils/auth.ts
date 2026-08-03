import type { FastifyRequest, FastifyReply } from "fastify";
import jwt, { type SignOptions } from "jsonwebtoken";
import crypto from "crypto";
import { getEnv } from "../config.js";
import { getPool } from "../db/pool.js";
import { logAuditAction } from "./audit.js";

export type Role = "admin" | "user" | "manager";

export interface JwtPayload {
  userId: number;
  username: string;
  role: Role;
  tokenVersion: number;
}

// ─── Access Token (15 min) ───
export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, getEnv().JWT_SECRET, { expiresIn: getEnv().JWT_ACCESS_EXPIRY } as SignOptions);
}

export function signTokenWithVersion(userId: number, username: string, role: Role, tokenVersion: number): string {
  return signToken({ userId, username, role, tokenVersion });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, getEnv().JWT_SECRET) as JwtPayload;
}

// ─── Refresh Token (7 days, stored as hash in DB, set as HttpOnly cookie) ───
export interface RefreshTokenPayload {
  userId: number;
  jti: string; // unique token ID
}

export async function createRefreshToken(userId: number, ipAddress?: string, userAgent?: string): Promise<{ token: string; jti: string }> {
  const env = getEnv();
  const jti = crypto.randomUUID();
  const token = crypto.randomBytes(64).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + env.JWT_REFRESH_EXPIRY_DAYS * 86400000);

  const pool = getPool();
  await pool.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, tokenHash, expiresAt, ipAddress || null, userAgent || null]
  );

  return { token, jti };
}

export async function verifyRefreshToken(token: string): Promise<{ userId: number; jti: string } | null> {
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const pool = getPool();
  const result = await pool.query(
    `SELECT user_id, id FROM refresh_tokens
     WHERE token_hash = $1 AND expires_at > now() AND revoked_at IS NULL`,
    [tokenHash]
  );
  if (result.rows.length === 0) return null;
  return { userId: result.rows[0].user_id, jti: result.rows[0].id };
}

export async function revokeRefreshToken(jti: string): Promise<void> {
  const pool = getPool();
  await pool.query("UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1", [jti]);
}

export async function revokeAllUserTokens(userId: number): Promise<void> {
  const pool = getPool();
  await pool.query("UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL", [userId]);
}

// ─── Auth Guards ───
export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const auth = request.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    return reply.status(401).send({ ok: false, error: "Missing token" });
  }
  try {
    const payload = verifyToken(auth.slice(7));
    const pool = getPool();
    const result = await pool.query("SELECT token_version FROM app_users WHERE id = $1", [payload.userId]);
    const dbVersion = result.rows[0]?.token_version ?? 1;
    if (dbVersion !== payload.tokenVersion) {
      return reply.status(401).send({ ok: false, error: "Token revoked" });
    }
    (request as any).user = payload;
  } catch {
    return reply.status(401).send({ ok: false, error: "Invalid token" });
  }
}

export async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  await requireAuth(request, reply);
  if (reply.sent) return;
  const user = (request as any).user as JwtPayload;
  if (user.role !== "admin") {
    logAuditAction(user.userId, "permission_denied", `Admin access denied for ${user.username} on ${request.url}`);
    return reply.status(403).send({ ok: false, error: "Admin role required" });
  }
}

export async function requireManager(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  await requireAuth(request, reply);
  if (reply.sent) return;
  const user = (request as any).user as JwtPayload;
  if (user.role !== "admin" && user.role !== "manager") {
    logAuditAction(user.userId, "permission_denied", `Manager access denied for ${user.username} on ${request.url}`);
    return reply.status(403).send({ ok: false, error: "Admin or manager role required" });
  }
}

export async function getUserAllowedTags(userId: number): Promise<string[] | null> {
  const pool = getPool();
  const result = await pool.query("SELECT role, allowed_tags FROM app_users WHERE id = $1", [userId]);
  const row = result.rows[0];
  if (!row) return null;
  if (row.role === "admin") return null;
  if (!row.allowed_tags || row.allowed_tags.length === 0) return null;
  return row.allowed_tags;
}

export async function getFilteredProjectIds(userId: number): Promise<number[] | null> {
  const tags = await getUserAllowedTags(userId);
  if (tags === null) return null;
  const pool = getPool();
  const result = await pool.query("SELECT id FROM projects WHERE tags && $1", [tags]);
  return result.rows.map((r: any) => r.id);
}
