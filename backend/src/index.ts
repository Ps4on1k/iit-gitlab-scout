import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
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
import { dependencyCatalogRoutes } from "./api/v1/dependency-catalog.js";
import { contributorDirectoryRoutes } from "./api/v1/contributor-directory.js";
import { dashboardRoutes } from "./api/v1/dashboard.js";
import { mrAnalyticsRoutes } from "./api/v1/mr-analytics.js";
import { contributorResolveRoutes } from "./api/v1/contributor-resolve.js";
import { commitDetailRoutes } from "./api/v1/commit-detail.js";
import { pipelineAnalyticsRoutes } from "./api/v1/pipeline-analytics.js";
import { auditLogRoutes } from "./api/v1/audit-log.js";
import { personalTokenRoutes } from "./api/v1/personal-tokens.js";
import { batchCollectRoutes } from "./api/v1/batch-collect.js";
import { doraMetricsRoutes } from "./api/v1/dora-metrics.js";
import { benchmarkRoutes } from "./api/v1/benchmark.js";
import { timeEntriesRoutes } from "./api/v1/time-entries.js";
import { filterPresetRoutes } from "./api/v1/filter-presets.js";
import { metricWeightsRoutes } from "./api/v1/metric-weights.js";
import { executiveReportRoutes } from "./api/v1/executive-report.js";
import { dataLineageRoutes } from "./api/v1/data-lineage.js";
import { dataCollectionRoutes } from "./api/v1/data-collection.js";
import { clickhouseSyncRoutes } from "./api/v1/clickhouse-sync.js";
import { dagsterTriggerRoutes } from "./api/v1/dagster-trigger.js";
import { ssoRoutes } from "./api/v1/sso.js";
import { redFlagsRoutes } from "./api/v1/red-flags.js";
import { startScheduler, stopScheduler } from "./services/scheduler.js";
import { requireAuth } from "./utils/auth.js";

const env = getEnv();
const app = Fastify({ logger: true, bodyLimit: 10 * 1024 * 1024 });

const corsOrigins = env.CORS_ORIGINS
  ? env.CORS_ORIGINS.split(",").map((s) => s.trim())
  : false;
await app.register(cors, { origin: corsOrigins, credentials: true });
await app.register(cookie);
await app.register(helmet, {
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      fontSrc: ["'self'"],
      connectSrc: ["'self'"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
    },
  },
});

// Additional security headers (helmet handles most; these supplement it)
app.addHook("onRequest", async (request, reply) => {
  reply.header("X-XSS-Protection", "1; mode=block");
  reply.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
});

// Rate limiting — sliding window (last 60s)
const RATE_LIMIT_MAX = 100;
const RATE_LIMIT_WINDOW_MS = 60_000;
const requestTimestamps = new Map<string, number[]>();

app.addHook("onRequest", async (request, reply) => {
  const ip = request.ip || "unknown";
  const now = Date.now();
  const timestamps = requestTimestamps.get(ip) || [];

  const validTimestamps = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (validTimestamps.length >= RATE_LIMIT_MAX) {
    return reply.status(429).send({ ok: false, error: "Too many requests" });
  }
  validTimestamps.push(now);
  requestTimestamps.set(ip, validTimestamps);

  if (requestTimestamps.size > 2000) {
    const cutoff = now - RATE_LIMIT_WINDOW_MS;
    for (const [k, v] of requestTimestamps) {
      const filtered = v.filter((t) => t > cutoff);
      if (filtered.length === 0) requestTimestamps.delete(k);
      else requestTimestamps.set(k, filtered);
    }
  }
});

// Request timeout (30s for regular requests, 120s for collect/stats)
const REQUEST_TIMEOUT_MS = 30_000;
const LONG_REQUEST_TIMEOUT_MS = 120_000;
const LONG_PATHS = ["/api/v1/stats", "/api/v1/collect/", "/api/v1/batch-collect"];

app.addHook("onRequest", async (request, reply) => {
  const isLongRequest = LONG_PATHS.some((p) => request.url.startsWith(p));
  const timeout = isLongRequest ? LONG_REQUEST_TIMEOUT_MS : REQUEST_TIMEOUT_MS;
  const timer = setTimeout(() => {
    if (!reply.sent) {
      reply.status(408).send({ ok: false, error: "Request timeout" });
    }
  }, timeout);
  reply.raw.on("finish", () => clearTimeout(timer));
});

// Sanitize errors — never leak internal details to client
app.setErrorHandler((error, request, reply) => {
  const err = error as any;
  app.log.error(error);
  reply.status(err.statusCode || 500).send({
    ok: false,
    error: "Internal server error",
  });
});

app.get("/health", async () => ({ status: "ok" }));

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
await app.register(dependencyCatalogRoutes);
await app.register(contributorDirectoryRoutes);
await app.register(dashboardRoutes);
await app.register(mrAnalyticsRoutes);
await app.register(contributorResolveRoutes);
await app.register(commitDetailRoutes);
await app.register(pipelineAnalyticsRoutes);
await app.register(auditLogRoutes);
await app.register(personalTokenRoutes);
await app.register(batchCollectRoutes);
await app.register(doraMetricsRoutes);
await app.register(benchmarkRoutes);
await app.register(timeEntriesRoutes);
await app.register(filterPresetRoutes);
await app.register(metricWeightsRoutes);
await app.register(dataLineageRoutes);
await app.register(dataCollectionRoutes);
await app.register(clickhouseSyncRoutes);
await app.register(executiveReportRoutes);
await app.register(dagsterTriggerRoutes);
await app.register(ssoRoutes);
await app.register(redFlagsRoutes);

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
