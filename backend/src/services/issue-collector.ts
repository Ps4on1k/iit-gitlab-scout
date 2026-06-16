import { getPool } from "../db/pool.js";
import { decrypt } from "../utils/crypto.js";
import { GitLabClient } from "./gitlab-client.js";

interface GitLabIssue {
  iid: number;
  title: string;
  state: string;
  author?: { email: string };
  assignees?: { email: string }[];
  labels: string[];
  created_at: string;
  closed_at: string | null;
  due_date: string | null;
  weight: number | null;
}

export async function collectIssues(projectId: number): Promise<{ total: number; opened: number; closed: number }> {
  const pool = getPool();
  const projResult = await pool.query(
    "SELECT id, path, token_encrypted, base_url FROM projects WHERE id = $1",
    [projectId]
  );
  const proj = projResult.rows[0];
  if (!proj) throw new Error(`Project ${projectId} not found`);

  const token = decrypt(proj.token_encrypted);
  const client = new GitLabClient({ token, baseUrl: proj.base_url });

  const issues = await client.requestPaginated<GitLabIssue>(
    `/projects/${encodeURIComponent(proj.path)}/issues?per_page=100&scope=all&state=all`
  );

  await pool.query("DELETE FROM project_issues WHERE project_id = $1", [projectId]);

  let opened = 0;
  let closed = 0;

  for (const issue of issues) {
    if (issue.state === "opened") opened++;
    else closed++;

    await pool.query(
      `INSERT INTO project_issues (project_id, gitlab_iid, title, state, author_email, assignee_email, labels, created_at, closed_at, due_date, weight)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        projectId, issue.iid, issue.title, issue.state,
        issue.author?.email || "", issue.assignees?.[0]?.email || "",
        (issue.labels || []).join(","),
        issue.created_at, issue.closed_at, issue.due_date, issue.weight,
      ]
    );
  }

  return { total: issues.length, opened, closed };
}
