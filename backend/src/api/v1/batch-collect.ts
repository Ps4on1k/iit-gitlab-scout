import type { FastifyInstance } from "fastify";
import { requireAdmin } from "../../utils/auth.js";
import { startBatchCollect, updateBatchCollect, addBatchError, finishBatchCollect } from "../../utils/collect-tracker.js";
import { getPool } from "../../db/pool.js";
import { decrypt } from "../../utils/crypto.js";
import { GitLabClient } from "../../services/gitlab-client.js";
import { collectProject } from "../../services/contributor-collector.js";
import { collectBranches } from "../../services/branch-collector.js";
import { collectActivity } from "../../services/activity-collector.js";
import { collectMergeRequests } from "../../services/mr-collector.js";
import { collectPipelines } from "../../services/pipeline-collector.js";
import { collectStack } from "../../services/stack-collector.js";
import { collectIssues } from "../../services/issue-collector.js";
import { collectDependenciesAudit } from "../../services/dependency-audit.js";
import { logCollectionError } from "../../utils/collection-error.js";

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

  for (let i = 0; i < projectIds.length; i++) {
    const projectId = projectIds[i];
    try {
      if (collector === "contributors" && (dateFrom || dateTo)) {
        await collectProject(projectId, dateFrom, dateTo);
      } else {
        await collectorDef.fn(projectId);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addBatchError(batchId, projectId, msg);
      logCollectionError(collectorDef.errorType, projectId, "BATCH", msg, "scheduler");
    }
    updateBatchCollect(batchId, i + 1);
    if (i < projectIds.length - 1) {
      await new Promise((r) => setTimeout(r, COLLECT_DELAY_MS));
    }
  }

  finishBatchCollect(batchId);
}

export async function batchCollectRoutes(app: FastifyInstance) {
  app.post<{
    Body: { collector: string; project_ids: number[]; date_from?: string; date_to?: string };
  }>("/api/v1/collect/batch", { preHandler: [requireAdmin] }, async (request, reply) => {
    const { collector, project_ids, date_from, date_to } = request.body;
    if (!collector || !project_ids?.length) {
      return reply.status(400).send({ ok: false, error: "collector and project_ids are required" });
    }
    if (!COLLECTORS[collector]) {
      return reply.status(400).send({ ok: false, error: `Unknown collector: ${collector}. Valid: ${Object.keys(COLLECTORS).join(", ")}` });
    }

    runBatchCollect(collector, project_ids, date_from, date_to).catch(() => {});

    return { ok: true, data: { started: true, total: project_ids.length } };
  });
}
