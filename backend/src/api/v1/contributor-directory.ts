import type { FastifyInstance } from "fastify";
import { requireAdmin } from "../../utils/auth.js";
import { getPool } from "../../db/pool.js";
import yamlLib from "js-yaml";

export async function contributorDirectoryRoutes(app: FastifyInstance) {
  // List all directory entries
  app.get("/api/v1/contributor-directory", { preHandler: [requireAdmin] }, async () => {
    const pool = getPool();
    const result = await pool.query(
      "SELECT * FROM contributor_directory ORDER BY display_name"
    );
    return { ok: true, data: result.rows };
  });

  // Create entry
  app.post<{
    Body: { display_name: string; emails: string[] };
  }>("/api/v1/contributor-directory", { preHandler: [requireAdmin] }, async (request, reply) => {
    const { display_name, emails } = request.body;
    if (!display_name || !emails || emails.length === 0) {
      return reply.status(400).send({ ok: false, error: "display_name and emails are required" });
    }

    const pool = getPool();
    try {
      const result = await pool.query(
        "INSERT INTO contributor_directory (display_name, emails) VALUES ($1, $2) RETURNING *",
        [display_name, emails]
      );
      return { ok: true, data: result.rows[0] };
    } catch (err: any) {
      if (err.code === "23505") {
        return reply.status(409).send({ ok: false, error: "Display name already exists" });
      }
      throw err;
    }
  });

  // Update entry
  app.put<{
    Params: { id: string };
    Body: { display_name?: string; emails?: string[] };
  }>("/api/v1/contributor-directory/:id", { preHandler: [requireAdmin] }, async (request, reply) => {
    const { id } = request.params;
    const { display_name, emails } = request.body;

    const pool = getPool();
    const existing = await pool.query("SELECT id FROM contributor_directory WHERE id = $1", [id]);
    if (existing.rows.length === 0) {
      return reply.status(404).send({ ok: false, error: "Entry not found" });
    }

    const updates: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (display_name !== undefined) { updates.push(`display_name = $${idx++}`); values.push(display_name); }
    if (emails !== undefined) { updates.push(`emails = $${idx++}`); values.push(emails); }

    if (updates.length === 0) {
      return reply.status(400).send({ ok: false, error: "Nothing to update" });
    }

    updates.push(`updated_at = now()`);
    values.push(id);

    const result = await pool.query(
      `UPDATE contributor_directory SET ${updates.join(", ")} WHERE id = $${idx} RETURNING *`,
      values
    );

    return { ok: true, data: result.rows[0] };
  });

  // Delete entry
  app.delete<{
    Params: { id: string };
  }>("/api/v1/contributor-directory/:id", { preHandler: [requireAdmin] }, async (request, reply) => {
    const { id } = request.params;
    const pool = getPool();
    const result = await pool.query("DELETE FROM contributor_directory WHERE id = $1 RETURNING id", [id]);
    if (result.rows.length === 0) {
      return reply.status(404).send({ ok: false, error: "Entry not found" });
    }
    return { ok: true, data: { deleted: true } };
  });

  // Import YAML
  app.post<{
    Body: { yaml: string };
  }>("/api/v1/contributor-directory/import", { preHandler: [requireAdmin] }, async (request, reply) => {
    const { yaml } = request.body;
    if (!yaml) {
      return reply.status(400).send({ ok: false, error: "yaml is required" });
    }

    try {
      const parsed = yamlLib.load(yaml) as any;
      const entries = parsed.contributors || parsed;
      if (!Array.isArray(entries)) {
        return reply.status(400).send({ ok: false, error: "Invalid YAML: expected array of contributors" });
      }

      const pool = getPool();
      const imported: { display_name: string; emails: string[] }[] = [];
      const errors: { display_name: string; error: string }[] = [];

      for (const entry of entries) {
        if (!entry.name || !entry.emails || !Array.isArray(entry.emails)) {
          errors.push({ display_name: entry.name || "unknown", error: "Missing name or emails array" });
          continue;
        }
        try {
          await pool.query(
            `INSERT INTO contributor_directory (display_name, emails)
             VALUES ($1, $2)
             ON CONFLICT (display_name) DO UPDATE SET
               emails = EXCLUDED.emails,
               updated_at = now()`,
            [entry.name, entry.emails]
          );
          imported.push({ display_name: entry.name, emails: entry.emails });
        } catch (err) {
          errors.push({ display_name: entry.name, error: err instanceof Error ? err.message : String(err) });
        }
      }

      return { ok: true, data: { imported, errors, total: entries.length } };
    } catch (err) {
      return reply.status(400).send({ ok: false, error: "Invalid YAML format" });
    }
  });

  // Export YAML
  app.get("/api/v1/contributor-directory/export", { preHandler: [requireAdmin] }, async () => {
    const pool = getPool();
    const result = await pool.query("SELECT display_name, emails FROM contributor_directory ORDER BY display_name");
    const data = { contributors: result.rows.map((r: any) => ({ name: r.display_name, emails: r.emails })) };
    const yaml = yamlLib.dump(data, { lineWidth: -1 });
    return { ok: true, data: { yaml } };
  });

  // Get mapping: email -> display_name
  app.get("/api/v1/contributor-directory/mapping", { preHandler: [requireAdmin] }, async () => {
    const pool = getPool();
    const result = await pool.query("SELECT display_name, emails FROM contributor_directory");
    const mapping: Record<string, string> = {};
    for (const row of result.rows) {
      for (const email of row.emails) {
        mapping[email] = row.display_name;
      }
    }
    return { ok: true, data: mapping };
  });

  // Flat export: all unique contributors from analytics + directory names
  app.get("/api/v1/contributor-directory/flat-export", { preHandler: [requireAdmin] }, async () => {
    const pool = getPool();

    const commitsResult = await pool.query(
      `SELECT DISTINCT author_email FROM commits`
    );

    const profilesResult = await pool.query(
      `SELECT DISTINCT author_email, MAX(author_name) as author_name FROM contributor_profiles GROUP BY author_email`
    );

    const branchesResult = await pool.query(
      `SELECT DISTINCT last_commit_author_email, last_commit_author
       FROM project_branches
       WHERE last_commit_author_email IS NOT NULL AND last_commit_author_email != ''`
    );

    const emailToName: Record<string, string> = {};
    const dirResult = await pool.query("SELECT display_name, emails FROM contributor_directory");
    for (const row of dirResult.rows) {
      for (const email of row.emails) {
        emailToName[email] = row.display_name;
      }
    }

    const allEmails = new Set<string>();
    for (const r of commitsResult.rows) allEmails.add(r.author_email);
    for (const r of profilesResult.rows) allEmails.add(r.author_email);
    for (const r of branchesResult.rows) if (r.last_commit_author_email) allEmails.add(r.last_commit_author_email);

    const profilesMap: Record<string, string> = {};
    for (const r of profilesResult.rows) profilesMap[r.author_email] = r.author_name;

    const branchesMap: Record<string, string> = {};
    for (const r of branchesResult.rows) if (r.last_commit_author_email) branchesMap[r.last_commit_author_email] = r.last_commit_author;

    const contributors = Array.from(allEmails).map((email) => ({
      name: emailToName[email] || profilesMap[email] || branchesMap[email] || email,
      email,
    })).sort((a, b) => a.name.localeCompare(b.name));

    return { ok: true, data: { contributors, total: contributors.length } };
  });
}
