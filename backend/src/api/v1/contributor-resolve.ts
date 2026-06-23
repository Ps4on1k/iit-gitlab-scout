import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../utils/auth.js";
import { getPool } from "../../db/pool.js";

export async function contributorResolveRoutes(app: FastifyInstance) {
  app.get<{
    Querystring: { email?: string };
  }>("/api/v1/contributors/resolve", { preHandler: [requireAuth] }, async (request) => {
    const { email } = request.query;
    if (!email) return { ok: true, data: { email: "", name: "" } };

    const pool = getPool();

    // Check contributor directory first
    const dirResult = await pool.query("SELECT display_name, emails FROM contributor_directory");
    for (const row of dirResult.rows) {
      if (row.emails.includes(email)) {
        const firstEmail = row.emails[0];
        const cpResult = await pool.query(
          "SELECT author_name FROM contributor_profiles WHERE author_email = $1 LIMIT 1",
          [firstEmail]
        );
        return { ok: true, data: { email: firstEmail, name: cpResult.rows[0]?.author_name || row.display_name } };
      }
    }

    // Check if email exists in contributor_profiles
    const cpResult = await pool.query(
      "SELECT author_email, author_name FROM contributor_profiles WHERE author_email = $1 LIMIT 1",
      [email]
    );
    if (cpResult.rows.length > 0) {
      return { ok: true, data: { email: cpResult.rows[0].author_email, name: cpResult.rows[0].author_name || email } };
    }

    // Email not found — try to find by name
    const nameResult = await pool.query(
      "SELECT author_email, author_name FROM contributor_profiles WHERE author_name ILIKE $1 LIMIT 1",
      [`%${email}%`]
    );
    if (nameResult.rows.length > 0) {
      return { ok: true, data: { email: nameResult.rows[0].author_email, name: nameResult.rows[0].author_name } };
    }

    return { ok: true, data: { email: email, name: email } };
  });
}
