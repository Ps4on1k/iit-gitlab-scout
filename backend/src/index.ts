import Fastify from "fastify";
import cors from "@fastify/cors";
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
import { startScheduler, stopScheduler } from "./services/scheduler.js";

const env = getEnv();
const app = Fastify({ logger: true });

await app.register(cors, { origin: true });

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
await app.register(contributorDirectoryRoutes);
await app.register(dashboardRoutes);
await app.register(mrAnalyticsRoutes);

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
