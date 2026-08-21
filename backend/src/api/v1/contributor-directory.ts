import type { FastifyInstance } from "fastify";
import { requireAdmin } from "../../utils/auth.js";
import { getPool } from "../../db/pool.js";
import { z } from "zod";
import yamlLib from "js-yaml";
import { safeErrorMessage } from "../../utils/safe-error.js";

const emailSchema = z.string().email().max(255);

const contributorDirectorySchema = z.object({
  display_name: z.string().min(1).max(200),
  emails: z.array(emailSchema).min(1).max(20),
});

export async function contributorDirectoryRoutes(app: FastifyInstance) {
  // List all directory entries (with email-conflict detection)
  app.get("/api/v1/contributor-directory", { preHandler: [requireAdmin] }, async () => {
    const pool = getPool();
    const result = await pool.query(`
      SELECT
        cd.*,
        EXISTS(
          SELECT 1 FROM contributor_directory cd2, unnest(cd2.emails) e2
          WHERE cd2.id != cd.id AND LOWER(e2) IN (SELECT LOWER(unnest(cd.emails)))
        ) as has_email_conflicts
      FROM contributor_directory cd
      ORDER BY cd.display_name
    `);
    return { ok: true, data: result.rows };
  });

  // Validate emails — check for conflicts BEFORE creating/updating
  app.post<{
    Body: { display_name: string; emails: string[]; exclude_id?: number };
  }>("/api/v1/contributor-directory/validate", { preHandler: [requireAdmin] }, async (request, reply) => {
    const { display_name, emails, exclude_id } = request.body;
    if (!display_name || !emails || !Array.isArray(emails)) {
      return reply.status(400).send({ ok: false, error: "display_name and emails[] are required" });
    }
    const pool = getPool();
    const conflicts: { email: string; assigned_to: string }[] = [];
    for (const email of emails) {
      const check = await pool.query(
        `SELECT display_name FROM contributor_directory
         WHERE EXISTS (SELECT 1 FROM unnest(emails) e WHERE LOWER(e) = LOWER($1))
           AND id != COALESCE($2, -1)`,
        [email, exclude_id || -1]
      );
      if (check.rows.length > 0) {
        conflicts.push({ email, assigned_to: check.rows[0].display_name });
      }
    }
    const normalized = emails.map((e) => e.toLowerCase());
    const uniqueCount = new Set(normalized).size;
    return {
      ok: true,
      data: {
        valid: conflicts.length === 0 && uniqueCount === emails.length,
        conflicts,
        has_duplicates_in_input: uniqueCount !== normalized.length,
      },
    };
  });

  // Create entry — validates no email conflicts first
  app.post<{
    Body: { display_name: string; emails: string[] };
  }>("/api/v1/contributor-directory", { preHandler: [requireAdmin] }, async (request, reply) => {
    const v = contributorDirectorySchema.safeParse(request.body);
    if (!v.success) {
      return reply.status(400).send({ ok: false, error: v.error.errors.map((e) => e.message).join(", ") });
    }
    const { display_name, emails } = v.data;

    const pool = getPool();
    // Check for email conflicts with other entries
    for (const email of emails) {
      const check = await pool.query(
        `SELECT display_name FROM contributor_directory
         WHERE EXISTS (SELECT 1 FROM unnest(emails) e WHERE LOWER(e) = LOWER($1))`,
        [email]
      );
      if (check.rows.length > 0) {
        return reply.status(409).send({
          ok: false,
          error: `Email "${email}" уже привязан к "${check.rows[0].display_name}". Уберите email из другой записи сначала.`,
        });
      }
    }

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

  // Update entry — validates no email conflicts first
  app.put<{
    Params: { id: string };
    Body: { display_name?: string; emails?: string[]; is_valid?: boolean };
  }>("/api/v1/contributor-directory/:id", { preHandler: [requireAdmin] }, async (request, reply) => {
    const { id } = request.params;
    const { display_name, emails, is_valid } = request.body;

    const pool = getPool();
    const existing = await pool.query("SELECT id, display_name FROM contributor_directory WHERE id = $1", [id]);
    if (existing.rows.length === 0) {
      return reply.status(404).send({ ok: false, error: "Entry not found" });
    }

    // Validate email conflicts if emails are being updated
    if (emails !== undefined) {
      for (const email of emails) {
        const check = await pool.query(
          `SELECT display_name FROM contributor_directory
           WHERE EXISTS (SELECT 1 FROM unnest(emails) e WHERE LOWER(e) = LOWER($1))
             AND id != $2`,
          [email, Number(id)]
        );
        if (check.rows.length > 0) {
          return reply.status(409).send({
            ok: false,
            error: `Email "${email}" уже привязан к "${check.rows[0].display_name}". Уберите email из другой записи сначала.`,
          });
        }
      }
    }

    const updates: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (display_name !== undefined) { updates.push(`display_name = $${idx++}`); values.push(display_name); }
    if (emails !== undefined) { updates.push(`emails = $${idx++}`); values.push(emails); }
    if (is_valid !== undefined) { updates.push(`is_valid = $${idx++}`); values.push(is_valid); }

    if (updates.length === 0) {
      return reply.status(400).send({ ok: false, error: "Nothing to update" });
    }

    updates.push(`updated_at = now()`);
    values.push(Number(id));

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
  }>("/api/v1/contributor-directory/import", { preHandler: [requireAdmin], bodyLimit: 1024 * 1024 }, async (request, reply) => {
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
          errors.push({ display_name: entry.name, error: safeErrorMessage(err) });
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

  // Flat export: all unique contributors from analytics, deduplicated by name via directory
  app.get("/api/v1/contributor-directory/flat-export", { preHandler: [requireAdmin] }, async () => {
    const pool = getPool();

    const commitsResult = await pool.query(`SELECT DISTINCT author_email FROM commits`);
    const profilesResult = await pool.query(
      `SELECT DISTINCT author_email, MAX(author_name) as author_name FROM contributor_profiles GROUP BY author_email`
    );
    const branchesResult = await pool.query(
      `SELECT DISTINCT last_commit_author_email, last_commit_author
       FROM project_branches
       WHERE last_commit_author_email IS NOT NULL AND last_commit_author_email != ''`
    );
    const dirResult = await pool.query("SELECT display_name, emails FROM contributor_directory");

    const emailToName: Record<string, string> = {};
    const nameToEmails: Record<string, Set<string>> = {};
    for (const row of dirResult.rows) {
      const name = row.display_name;
      if (!nameToEmails[name]) nameToEmails[name] = new Set();
      for (const email of row.emails) {
        emailToName[email] = name;
        nameToEmails[name].add(email);
      }
    }

    const profilesMap: Record<string, string> = {};
    for (const r of profilesResult.rows) profilesMap[r.author_email] = r.author_name;

    const branchesMap: Record<string, string> = {};
    for (const r of branchesResult.rows) if (r.last_commit_author_email) branchesMap[r.last_commit_author_email] = r.last_commit_author;

    const allEmails = new Set<string>();
    for (const r of commitsResult.rows) allEmails.add(r.author_email);
    for (const r of profilesResult.rows) allEmails.add(r.author_email);
    for (const r of branchesResult.rows) if (r.last_commit_author_email) allEmails.add(r.last_commit_author_email);

    const nameToPrimaryEmail: Record<string, string> = {};
    const allNames = new Set<string>();
    for (const email of allEmails) {
      const name = emailToName[email] || profilesMap[email] || branchesMap[email] || email;
      allNames.add(name);
      if (!nameToPrimaryEmail[name]) nameToPrimaryEmail[name] = email;
      if (nameToEmails[name]) nameToEmails[name].add(email);
    }
    for (const name of allNames) {
      if (!nameToEmails[name]) nameToEmails[name] = new Set([nameToPrimaryEmail[name]]);
    }

    const contributors = Array.from(allNames)
      .map((name) => ({ name, email: nameToPrimaryEmail[name] }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return { ok: true, data: { contributors, total: contributors.length } };
  });

  // Sync users from GitLab API into contributor_directory
  app.post("/api/v1/contributor-directory/sync-from-gitlab", { preHandler: [requireAdmin] }, async (request, reply) => {
    const pool = getPool();
    const { resolveProjectToken } = await import("../../utils/project-token.js");
    const { GitLabClient } = await import("../../services/gitlab-client.js");

    const projResult = await pool.query("SELECT id, base_url, token_encrypted FROM projects LIMIT 1");
    if (projResult.rows.length === 0) {
      return reply.status(400).send({ ok: false, error: "No projects configured" });
    }
    const proj = projResult.rows[0];

    let token: string;
    let baseUrl: string;
    try {
      const resolved = await resolveProjectToken(proj.id);
      token = resolved.token;
      baseUrl = resolved.baseUrl;
    } catch (err) {
      return reply.status(500).send({ ok: false, error: "Failed to resolve GitLab token" });
    }

    if (!token) {
      return reply.status(400).send({ ok: false, error: "No valid GitLab token" });
    }

    const client = new GitLabClient({ token, baseUrl });

    const dirResult = await pool.query("SELECT id, display_name, emails, gitlab_user_id FROM contributor_directory");
    const existingByName: Record<string, { id: number; emails: string[] }> = {};
    const existingByEmail: Record<string, number> = {};
    for (const row of dirResult.rows) {
      existingByName[row.display_name] = { id: row.id, emails: row.emails || [] };
      for (const email of row.emails || []) {
        existingByEmail[email] = row.id;
      }
    }

    let synced = 0;
    let created = 0;
    let updated = 0;

    let page = 1;
    let hasMore = true;
    while (hasMore) {
      const users = await client.requestPaginated<any>(
        `/users?per_page=100&page=${page}`
      );
      if (users.length === 0) { hasMore = false; break; }

      for (const user of users) {
        const username = user.username || "";
        const name = user.name || username;
        const email = user.commit_email || user.email || user.public_email || "";
        const gitlabUserId = user.id || null;

        if (!name && !email) continue;
        const emails = email ? [email] : [];

        if (existingByEmail[email]) { synced++; continue; }

        if (existingByName[name]) {
          if (email && !existingByName[name].emails.includes(email)) {
            const newEmails = [...existingByName[name].emails, email];
            await pool.query(
              "UPDATE contributor_directory SET emails = $1, gitlab_user_id = COALESCE(gitlab_user_id, $2) WHERE id = $3",
              [newEmails, gitlabUserId, existingByName[name].id]
            );
            existingByName[name].emails = newEmails;
            existingByEmail[email] = existingByName[name].id;
            updated++;
          }
          continue;
        }

        if (emails.length > 0 || name) {
          const displayName = name || email;
          const result = await pool.query(
            `INSERT INTO contributor_directory (display_name, emails, gitlab_user_id)
             VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING id`,
            [displayName, emails, gitlabUserId]
          );
          if (result.rows.length > 0) {
            existingByName[displayName] = { id: result.rows[0].id, emails };
            for (const e of emails) existingByEmail[e] = result.rows[0].id;
            created++;
          }
        }
        synced++;
      }
      page++;
      if (users.length < 100) hasMore = false;
    }

    return { ok: true, data: { synced, created, updated } };
  });
}