import type { FastifyRequest, FastifyReply } from "fastify";
import jwt from "jsonwebtoken";
import { getEnv } from "../config.js";
import { getPool } from "../db/pool.js";
import { logAuditAction } from "./audit.js";

export type Role = "admin" | "user" | "manager";

export interface JwtPayload {
  userId: number;
  username: string;
  role: Role;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, getEnv().JWT_SECRET, { expiresIn: "24h" });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, getEnv().JWT_SECRET) as JwtPayload;
}

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
