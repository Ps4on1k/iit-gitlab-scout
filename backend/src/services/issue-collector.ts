import { getPool } from "../db/pool.js";
import { resolveProjectToken } from "../utils/project-token.js";
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
  const { token, baseUrl, path: projectPath } = await resolveProjectToken(projectId);

  const client = new GitLabClient({ token, baseUrl });

  const issues = await client.requestPaginated<GitLabIssue>(
    `/projects/${encodeURIComponent(projectPath)}/issues?per_page=100&scope=all&state=all`
  );

  await pool.query("DELETE FROM project_issues WHERE project_id = $1", [projectId]);

  let opened = 0;
  let closed = 0;

  for (const issue of issues) {
    if (issue.state === "opened") opened++;
    else closed++;
  }

  if (issues.length > 0) {
    const { batchInsert } = await import("../utils/batch.js");
    const columns = ["project_id", "gitlab_iid", "title", "state", "author_email", "assignee_email", "labels", "created_at", "closed_at", "due_date", "weight"];
    const rows = issues.map((issue) => [
      projectId, issue.iid, issue.title, issue.state,
      issue.author?.email || "", issue.assignees?.[0]?.email || "",
      (issue.labels || []).join(","),
      issue.created_at, issue.closed_at, issue.due_date, issue.weight,
    ]);
    await batchInsert("project_issues", columns, rows);
  }

  return { total: issues.length, opened, closed };
}
