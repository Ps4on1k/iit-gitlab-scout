import type { FastifyInstance } from "fastify";
import { requireAdmin } from "../../utils/auth.js";
import { startBatchCollect, updateBatchCollect, addBatchError, finishBatchCollect, isAnyCollectionRunning } from "../../utils/collect-tracker.js";
import { getPool } from "../../db/pool.js";
import { decrypt } from "../../utils/crypto.js";
import { GitLabClient } from "../../services/gitlab-client.js";
import { resolveProjectToken } from "../../utils/project-token.js";
import { collectProject } from "../../services/contributor-collector.js";
import { collectBranches } from "../../services/branch-collector.js";
import { collectActivity } from "../../services/activity-collector.js";
import { collectMergeRequests } from "../../services/mr-collector.js";
import { collectPipelines } from "../../services/pipeline-collector.js";
import { collectStack } from "../../services/stack-collector.js";
import { collectIssues } from "../../services/issue-collector.js";
import { collectDependenciesAudit } from "../../services/dependency-audit.js";
import { logCollectionError } from "../../utils/collection-error.js";
import { safeErrorMessage } from "../../utils/safe-error.js";

const COLLECT_DELAY_MS = 2000;

type CollectorFn = (projectId: number) => Promise<any>;

const COLLECTORS: Record<string, { fn: CollectorFn; errorType: string }> = {
  contributors: {
    fn: (id) => collectProject(id),
    errorType: "collect_contributors",
  },
  branches: {
    fn: (id) => collectBranches(id),
    errorType: "collect_branches",
  },
  activity: {
    fn: (id) => collectActivity(id),
    errorType: "collect_activity",
  },
  mr: {
    fn: (id) => collectMergeRequests(id),
    errorType: "collect_merge_requests",
  },
  activity_mr: {
    fn: async (id) => {
      await collectActivity(id);
      await collectMergeRequests(id);
    },
    errorType: "collect_activity_mr",
  },
  pipelines: {
    fn: (id) => collectPipelines(id),
    errorType: "collect_pipelines",
  },
  stack: {
    fn: (id) => collectStack(id),
    errorType: "collect_stack",
  },
  issues: {
    fn: (id) => collectIssues(id),
    errorType: "collect_issues",
  },
  dependencies: {
    fn: (id) => collectDependenciesAudit(id),
    errorType: "collect_dependencies",
  },
};

async function runBatchCollect(collector: string, projectIds: number[], dateFrom?: string, dateTo?: string) {
  const collectorDef = COLLECTORS[collector];
  if (!collectorDef) return;

  const batchId = startBatchCollect(collector, projectIds);
  const skipped: number[] = [];

  for (let i = 0; i < projectIds.length; i++) {
    const projectId = projectIds[i];
    updateBatchCollect(batchId, i);

    try {
      const { token, baseUrl } = await resolveProjectToken(projectId);
      if (!token) {
        addBatchError(batchId, projectId, "No token configured");
        logCollectionError(collectorDef.errorType, projectId, "BATCH", "No token configured", "scheduler");
        skipped.push(projectId);
        continue;
      }

      const client = new GitLabClient({ token, baseUrl });
      try {
        await client.request<any>("/user");
      } catch {
        addBatchError(batchId, projectId, "Token validation failed — skipped");
        logCollectionError(collectorDef.errorType, projectId, "BATCH", "Token validation failed", "scheduler");
        skipped.push(projectId);
        continue;
      }

      if (collector === "contributors" && (dateFrom || dateTo)) {
        await collectProject(projectId, dateFrom, dateTo);
      } else {
        await collectorDef.fn(projectId);
      }
    } catch (err) {
      const msg = safeErrorMessage(err);
      addBatchError(batchId, projectId, msg);
      logCollectionError(collectorDef.errorType, projectId, "BATCH", msg, "scheduler");
    }
    if (i < projectIds.length - 1) {
      await new Promise((r) => setTimeout(r, COLLECT_DELAY_MS));
    }
  }

  updateBatchCollect(batchId, projectIds.length);
  finishBatchCollect(batchId);
}

export async function batchCollectRoutes(app: FastifyInstance) {
  app.post<{
    Body: { project_ids: number[] };
  }>("/api/v1/collect/validate-tokens", { preHandler: [requireAdmin] }, async (request, reply) => {
    const { project_ids } = request.body;
    if (!Array.isArray(project_ids) || project_ids.length === 0) {
      return reply.status(400).send({ ok: false, error: "project_ids must be a non-empty array of positive integers" });
    }
    if (!project_ids.every((id) => typeof id === "number" && Number.isInteger(id) && id > 0)) {
      return reply.status(400).send({ ok: false, error: "project_ids must contain only positive integers" });
    }

    const pool = getPool();
    const results: { project_id: number; label: string; valid: boolean; error?: string }[] = [];

    for (const projectId of project_ids) {
      const projResult = await pool.query("SELECT label FROM projects WHERE id = $1", [projectId]);
      const label = projResult.rows[0]?.label || `#${projectId}`;

      try {
        const { token, baseUrl } = await resolveProjectToken(projectId);
        if (!token) {
          results.push({ project_id: projectId, label, valid: false, error: "No token" });
          continue;
        }
        const client = new GitLabClient({ token, baseUrl });
        await client.request<any>("/user");
        results.push({ project_id: projectId, label, valid: true });
      } catch (err) {
        results.push({ project_id: projectId, label, valid: false, error: safeErrorMessage(err) });
      }
    }

    const valid = results.filter((r) => r.valid).length;
    const invalid = results.filter((r) => !r.valid);

    return {
      ok: true,
      data: { total: results.length, valid, invalid },
    };
  });

  app.post<{
    Body: { collector: string; project_ids: number[]; date_from?: string; date_to?: string };
  }>("/api/v1/collect/batch", { preHandler: [requireAdmin] }, async (request, reply) => {
    const { collector, project_ids, date_from, date_to } = request.body;
    if (!collector || !Array.isArray(project_ids) || project_ids.length === 0) {
      return reply.status(400).send({ ok: false, error: "collector and project_ids (non-empty array) are required" });
    }
    if (!project_ids.every((id) => typeof id === "number" && Number.isInteger(id) && id > 0)) {
      return reply.status(400).send({ ok: false, error: "project_ids must contain only positive integers" });
    }
    if (!COLLECTORS[collector]) {
      return reply.status(400).send({ ok: false, error: `Unknown collector: ${collector}. Valid: ${Object.keys(COLLECTORS).join(", ")}` });
    }
    if (isAnyCollectionRunning()) {
      return reply.status(409).send({ ok: false, error: "Сбор уже запущен. Дождитесь завершения." });
    }

    runBatchCollect(collector, project_ids, date_from, date_to).catch(() => {});

    return { ok: true, data: { started: true, total: project_ids.length } };
  });
}
