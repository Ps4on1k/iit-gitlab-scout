import type { FastifyInstance } from "fastify";
import { getPool } from "../../db/pool.js";
import { verifyPassword, hashPassword } from "../../utils/password.js";
import { signToken, requireAuth } from "../../utils/auth.js";
import { validate, loginSchema } from "../../utils/validation.js";
import { logAuditAction } from "../../utils/audit.js";
import type { JwtPayload } from "../../utils/auth.js";

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const LOGIN_RATE_WINDOW_MS = 60 * 1000; // 1 minute
const LOGIN_RATE_MAX = 10; // max attempts per IP per minute

const loginIpAttempts = new Map<string, { count: number; resetAt: number }>();

async function seedDefaultUsers() {
  const pool = getPool();
  const result = await pool.query("SELECT COUNT(*) as cnt FROM app_users");
  if (Number(result.rows[0].cnt) === 0) {
    const adminHash = await hashPassword("admin");
    const userHash = await hashPassword("user");
    await pool.query(
      "INSERT INTO app_users (username, password_hash, role) VALUES ($1, $2, 'admin'), ($3, $4, 'user')",
      ["admin", adminHash, "user", userHash]
    );
  }
}

export async function authRoutes(app: FastifyInstance) {
  await seedDefaultUsers();

  app.post<{
    Body: { username: string; password: string };
  }>("/api/v1/auth/login", async (request, reply) => {
    const ip = request.ip || "unknown";
    const now = Date.now();

    // Per-IP rate limit
    const ipEntry = loginIpAttempts.get(ip);
    if (ipEntry && now < ipEntry.resetAt) {
      if (ipEntry.count >= LOGIN_RATE_MAX) {
        logAuditAction(0, "login_rate_limited", `Rate limited IP: ${ip}`);
        return reply.status(429).send({ ok: false, error: "Too many login attempts. Try again later." });
      }
      ipEntry.count++;
    } else {
      loginIpAttempts.set(ip, { count: 1, resetAt: now + LOGIN_RATE_WINDOW_MS });
    }

    if (loginIpAttempts.size > 1000) {
      for (const [k, v] of loginIpAttempts) {
        if (now > v.resetAt) loginIpAttempts.delete(k);
      }
    }

    const { username, password } = request.body;

    const v = validate(loginSchema, request.body);
    if (!v.success) return reply.status(400).send({ ok: false, error: v.error });

    const pool = getPool();
    const result = await pool.query(
      "SELECT id, username, password_hash, role, is_active, failed_login_attempts, locked_until FROM app_users WHERE username = $1",
      [username]
    );

    const user = result.rows[0];
    if (!user) {
      logAuditAction(0, "login_failed", `Failed login attempt (unknown user): ${username} from ${ip}`);
      return reply.status(401).send({ ok: false, error: "Invalid credentials" });
    }

    if (!user.is_active) {
      logAuditAction(user.id, "login_blocked", `Login blocked (inactive account): ${username} from ${ip}`);
      return reply.status(403).send({ ok: false, error: "Account is blocked" });
    }

    // Check lockout
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      const remainingMs = new Date(user.locked_until).getTime() - now;
      const remainingMin = Math.ceil(remainingMs / 60000);
      logAuditAction(user.id, "login_locked", `Login blocked (account locked): ${username} from ${ip}, ${remainingMin}m remaining`);
      return reply.status(429).send({
        ok: false,
        error: `Account is locked. Try again in ${remainingMin} minute${remainingMin > 1 ? "s" : ""}.`,
      });
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      const newAttempts = (user.failed_login_attempts || 0) + 1;
      const lockUntil = newAttempts >= MAX_FAILED_ATTEMPTS
        ? new Date(now + LOCKOUT_DURATION_MS).toISOString()
        : null;

      await pool.query(
        "UPDATE app_users SET failed_login_attempts = $1, locked_until = $2 WHERE id = $3",
        [newAttempts, lockUntil, user.id]
      );

      const remaining = MAX_FAILED_ATTEMPTS - newAttempts;
      logAuditAction(user.id, "login_failed", `Failed login: ${username} from ${ip} (${remaining} attempts remaining)`);

      if (lockUntil) {
        logAuditAction(user.id, "login_locked", `Account locked for 15 minutes: ${username}`);
        return reply.status(401).send({
          ok: false,
          error: "Account locked due to too many failed attempts. Try again in 15 minutes.",
        });
      }

      return reply.status(401).send({
        ok: false,
        error: `Invalid credentials. ${remaining} attempt${remaining !== 1 ? "s" : ""} remaining before lockout.`,
      });
    }

    // Successful login — reset failed attempts
    await pool.query(
      "UPDATE app_users SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1",
      [user.id]
    );

    logAuditAction(user.id, "login_success", `Successful login: ${username} from ${ip}`);

    const token = signToken({
      userId: user.id,
      username: user.username,
      role: user.role,
    });

    return {
      ok: true,
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
        },
      },
    };
  });

  app.get("/api/v1/auth/me", { preHandler: [requireAuth] }, async (request) => {
    const user = (request as any).user as JwtPayload;
    const pool = getPool();
    const result = await pool.query("SELECT allowed_tags FROM app_users WHERE id = $1", [user.userId]);
    const allowed_tags = result.rows[0]?.allowed_tags || [];
    return { ok: true, data: { id: user.userId, username: user.username, role: user.role, allowed_tags } };
  });
}
