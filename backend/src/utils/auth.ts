import type { FastifyRequest, FastifyReply } from "fastify";
import jwt from "jsonwebtoken";
import { getEnv } from "../config.js";

export type Role = "admin" | "user";

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
    return reply.status(403).send({ ok: false, error: "Admin role required" });
  }
}
