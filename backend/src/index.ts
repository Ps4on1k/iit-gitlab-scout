import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import { getEnv } from "./config.js";
import { closePool } from "./db/pool.js";
import { authRoutes } from "./api/v1/auth.js";
import { projectsRoutes } from "./api/v1/projects.js";
import { contributorsRoutes } from "./api/v1/contributors.js";
import { stackRoutes } from "./api/v1/stack.js";
import { batchStatsRoutes } from "./api/v1/stats.js";
import { contributorAnalyticsRoutes } from "./api/v1/contributor-analytics.js";
import { userManagementRoutes } from "./api/v1/users.js";
import { stackAnalyticsRoutes } from "./api/v1/stack-analytics.js";
import { activityRoutes } from "./api/v1/activity.js";
import { schedulerRoutes } from "./api/v1/scheduler.js";
import { branchRoutes } from "./api/v1/branches.js";
import { issueRoutes } from "./api/v1/issues.js";
import { dependencyAuditRoutes } from "./api/v1/dependency-audit.js";
import { contributorDirectoryRoutes } from "./api/v1/contributor-directory.js";
import { dashboardRoutes } from "./api/v1/dashboard.js";
import { mrAnalyticsRoutes } from "./api/v1/mr-analytics.js";
import { contributorResolveRoutes } from "./api/v1/contributor-resolve.js";
import { commitDetailRoutes } from "./api/v1/commit-detail.js";
import { pipelineAnalyticsRoutes } from "./api/v1/pipeline-analytics.js";
import { auditLogRoutes } from "./api/v1/audit-log.js";
import { personalTokenRoutes } from "./api/v1/personal-tokens.js";
import { batchCollectRoutes } from "./api/v1/batch-collect.js";
import { securityPlugin } from "./utils/security.js";
import { startScheduler, stopScheduler } from "./services/scheduler.js";
import { getActiveJobs } from "./utils/collect-tracker.js";
import { requireAuth } from "./utils/auth.js";

const env = getEnv();
const app = Fastify({ logger: true });

await app.register(cors, { origin: true });
await app.register(helmet, {
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
});

// Security headers
app.addHook("onRequest", async (request, reply) => {
  reply.header("X-Content-Type-Options", "nosniff");
  reply.header("X-Frame-Options", "DENY");
  reply.header("X-XSS-Protection", "1; mode=block");
  reply.header("Referrer-Policy", "strict-origin-when-cross-origin");
  reply.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
});

// Rate limiting
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
app.addHook("onRequest", async (request, reply) => {
  const ip = request.ip || "unknown";
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (entry && now < entry.resetAt) {
    if (entry.count >= 100) return reply.status(429).send({ ok: false, error: "Too many requests" });
    entry.count++;
  } else {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60000 });
  }
  if (rateLimitMap.size > 1000) {
    for (const [k, v] of rateLimitMap) { if (now > v.resetAt) rateLimitMap.delete(k); }
  }
});

// Sanitize errors
app.setErrorHandler((error, request, reply) => {
  const isDev = process.env.NODE_ENV !== "production";
  const err = error as any;
  app.log.error(error);
  reply.status(err.statusCode || 500).send({
    ok: false,
    error: isDev ? err.message : "Internal server error",
  });
});

app.get("/health", async () => ({ status: "ok" }));

app.get("/api/v1/collect/status", { preHandler: [requireAuth] }, async () => {
  return { ok: true, data: getActiveJobs() };
});

await app.register(authRoutes);
await app.register(projectsRoutes);
await app.register(contributorsRoutes);
await app.register(stackRoutes);
await app.register(batchStatsRoutes);
await app.register(contributorAnalyticsRoutes);
await app.register(userManagementRoutes);
await app.register(stackAnalyticsRoutes);
await app.register(activityRoutes);
await app.register(schedulerRoutes);
await app.register(branchRoutes);
await app.register(issueRoutes);
await app.register(dependencyAuditRoutes);
await app.register(contributorDirectoryRoutes);
await app.register(dashboardRoutes);
await app.register(mrAnalyticsRoutes);
await app.register(contributorResolveRoutes);
await app.register(commitDetailRoutes);
await app.register(pipelineAnalyticsRoutes);
await app.register(auditLogRoutes);
await app.register(personalTokenRoutes);
await app.register(batchCollectRoutes);

const shutdown = async (signal: string) => {
  app.log.info(`${signal} received, shutting down...`);
  stopScheduler();
  await app.close();
  await closePool();
  process.exit(0);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

try {
  await app.listen({ port: env.PORT, host: env.HOST });
  startScheduler((msg: string) => {
    app.log.info(msg);
    process.stderr.write(msg + "\n");
  });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
