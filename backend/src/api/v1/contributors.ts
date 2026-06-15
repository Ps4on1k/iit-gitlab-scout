import type { FastifyInstance } from "fastify";
import { getPool } from "../../db/pool.js";
import { decrypt } from "../../utils/crypto.js";
import { requireAuth } from "../../utils/auth.js";
import { GitLabClient } from "../../services/gitlab-client.js";
import { getContributorStats } from "../../services/contributor-stats.js";
import type { ContributorFilters } from "../../services/contributor-stats.js";

export async function contributorsRoutes(app: FastifyInstance) {
  app.get<{
    Querystring: { project: string; month?: string; author?: string };
  }>("/api/v1/contributors", { preHandler: [requireAuth] }, async (request, reply) => {
    const { project, month, author } = request.query;

    if (!project) {
      return reply.status(400).send({ ok: false, error: "project is required" });
    }

    const pool = getPool();
    const result = await pool.query(
      "SELECT token_encrypted, base_url FROM projects WHERE path = $1",
      [project]
    );

    if (result.rows.length === 0) {
      return reply.status(404).send({ ok: false, error: "Project not found" });
    }

    const row = result.rows[0];
    const client = new GitLabClient({
      token: decrypt(row.token_encrypted),
      baseUrl: row.base_url,
    });

    const projectData = await client.getProject(project);
    const filters: ContributorFilters = { month, author };
    const stats = await getContributorStats(client, projectData.id, filters);

    return { ok: true, data: stats };
  });
}
