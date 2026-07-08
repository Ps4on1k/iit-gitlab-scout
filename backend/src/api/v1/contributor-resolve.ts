import type { FastifyInstance } from "fastify";
import { requireAuth, type JwtPayload } from "../../utils/auth.js";
import { getPool } from "../../db/pool.js";
import { getFilteredProjectIds } from "../../utils/project-filter.js";

export async function contributorResolveRoutes(app: FastifyInstance) {
  app.get<{
    Querystring: { email?: string };
  }>("/api/v1/contributors/resolve", { preHandler: [requireAuth] }, async (request) => {
    const { email } = request.query;
    if (!email) return { ok: true, data: { email: "", name: "" } };

    const user = (request as any).user as JwtPayload;
    const pool = getPool();
    const allowedIds = await getFilteredProjectIds(user.userId);
    const input = email.trim();

    // 1. Exact email in contributor_directory
    const dirResult = await pool.query("SELECT display_name, emails FROM contributor_directory");
    for (const row of dirResult.rows) {
      if (row.emails.includes(input)) {
        const firstEmail = row.emails[0];
        return { ok: true, data: { email: firstEmail, name: row.display_name } };
      }
    }

    // 2. Exact email in contributor_profiles
    const cpExact = await pool.query(
      "SELECT author_email, author_name FROM contributor_profiles WHERE author_email = $1 LIMIT 1",
      [input]
    );
    if (cpExact.rows.length > 0) {
      return { ok: true, data: { email: cpExact.rows[0].author_email, name: cpExact.rows[0].author_name || input } };
    }

    // 3. Name from directory (e.g. "Андрей Забойкин" matches display_name)
    for (const row of dirResult.rows) {
      if (row.display_name === input || row.display_name.toLowerCase().includes(input.toLowerCase())) {
        const firstEmail = row.emails[0];
        return { ok: true, data: { email: firstEmail, name: row.display_name } };
      }
    }

    // 4. ILIKE on author_name in contributor_profiles
    const cpName = await pool.query(
      "SELECT author_email, author_name FROM contributor_profiles WHERE author_name ILIKE $1 LIMIT 1",
      [`%${input}%`]
    );
    if (cpName.rows.length > 0) {
      return { ok: true, data: { email: cpName.rows[0].author_email, name: cpName.rows[0].author_name || input } };
    }

    // 5. ILIKE on author_email in contributor_profiles
    const cpEmail = await pool.query(
      "SELECT author_email, author_name FROM contributor_profiles WHERE author_email ILIKE $1 LIMIT 1",
      [`%${input}%`]
    );
    if (cpEmail.rows.length > 0) {
      return { ok: true, data: { email: cpEmail.rows[0].author_email, name: cpEmail.rows[0].author_name || input } };
    }

    // 6. Search commits table for this author (RBAC filtered)
    const projectCond = allowedIds !== null ? (allowedIds.length > 0 ? `AND project_id = ANY($2)` : `AND 1=0`) : "";
    const commitParams = allowedIds !== null ? (allowedIds.length > 0 ? [input, allowedIds] : [input]) : [input];
    const commitResult = await pool.query(
      `SELECT DISTINCT author_email, author_name FROM commits WHERE (author_name = $1 OR author_email = $1) ${projectCond} LIMIT 1`,
      commitParams
    );
    if (commitResult.rows.length > 0) {
      return { ok: true, data: { email: commitResult.rows[0].author_email, name: commitResult.rows[0].author_name || input } };
    }

    // 7. Search commits by ILIKE (RBAC filtered)
    const commitFuzzy = await pool.query(
      `SELECT DISTINCT author_email, author_name FROM commits WHERE (author_name ILIKE $1 OR author_email ILIKE $1) ${projectCond} LIMIT 1`,
      commitParams
    );
    if (commitFuzzy.rows.length > 0) {
      return { ok: true, data: { email: commitFuzzy.rows[0].author_email, name: commitFuzzy.rows[0].author_name || input } };
    }

    return { ok: true, data: { email: input, name: input } };
  });
}
