import type { FastifyInstance } from "fastify";
import { getPool } from "../../db/pool.js";
import { decrypt } from "../../utils/crypto.js";
import { GitLabClient } from "../../services/gitlab-client.js";
import { getContributorStats } from "../../services/contributor-stats.js";
import { analyzeStack } from "../../services/stack-analyzer.js";
import {
  saveAnalysisRun,
  getLatestRun,
  getRunProjects,
  getProjectHistory,
} from "../../db/repository.js";
import { requireAuth } from "../../utils/auth.js";
import type {
  ProjectStats,
  BatchStatsResponse,
} from "../../models/responses.js";
import { safeErrorMessage } from "../../utils/safe-error.js";

async function getProjectsFromDb() {
  const pool = getPool();
  const result = await pool.query(
    "SELECT id, path, label, token_encrypted, base_url FROM projects ORDER BY created_at"
  );
  return result.rows;
}

export async function batchStatsRoutes(app: FastifyInstance) {
  app.get<{
    Querystring: { month?: string; author?: string };
  }>("/api/v1/stats", { preHandler: [requireAuth] }, async (request) => {
    const { month, author } = request.query;
    const projects = await getProjectsFromDb();

    const results: ProjectStats[] = [];

    for (const proj of projects) {
      const token = proj.token_encrypted ? decrypt(proj.token_encrypted) : "";
      const client = new GitLabClient({
        token,
        baseUrl: proj.base_url,
      });

      try {
        const projectData = await client.getProject(proj.path);

        const contributors = await getContributorStats(client, projectData.id, { month, author });
        const stack = await analyzeStack(
          client,
          projectData.id,
          projectData.default_branch || "main",
          projectData.language
        );

        results.push({
          project: proj.path,
          label: proj.label || proj.path,
          contributors,
          stack,
        });
      } catch (err) {
        results.push({
          project: proj.path,
          label: proj.label || proj.path,
          contributors: [],
          stack: { language: null, dependency_files: [], total_dependencies: 0 },
          error: safeErrorMessage(err),
        });
      }
    }

    const response: BatchStatsResponse = {
      projects: results,
      analyzed_at: new Date().toISOString(),
    };

    const runId = await saveAnalysisRun(response);

    return { ok: true, data: { ...response, run_id: runId } };
  });

  app.get("/api/v1/stats/history", { preHandler: [requireAuth] }, async () => {
    const run = await getLatestRun();
    if (!run) return { ok: true, data: null };

    const projects = await getRunProjects(run.id);
    return {
      ok: true,
      data: {
        run_id: run.id,
        analyzed_at: run.analyzed_at,
        projects_count: run.projects_count,
        projects,
      },
    };
  });

  app.get<{
    Querystring: { project: string; limit?: string };
  }>("/api/v1/stats/project-history", { preHandler: [requireAuth] }, async (request, reply) => {
    const { project, limit } = request.query;
    if (!project) {
      return reply.status(400).send({ ok: false, error: "project is required" });
    }
    const history = await getProjectHistory(project, Number(limit) || 10);
    return { ok: true, data: history };
  });
}
