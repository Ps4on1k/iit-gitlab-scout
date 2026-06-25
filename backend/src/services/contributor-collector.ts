import { getPool } from "../db/pool.js";
import { resolveProjectToken } from "../utils/project-token.js";
import { GitLabClient } from "./gitlab-client.js";
import {
  upsertCommit,
  getExistingSha,
  refreshContributors,
} from "../db/contributor-repository.js";

interface GitLabCommitStats {
  additions?: number;
  deletions?: number;
  total?: number;
}

export interface CollectResult {
  project_id: number;
  project_path: string;
  new_commits: number;
  skipped_duplicates: number;
  total_processed: number;
}

export async function collectProject(
  projectId: number,
  dateFrom?: string,
  dateTo?: string
): Promise<CollectResult> {
  const pool = getPool();
  const { token, baseUrl, path: projectPath } = await resolveProjectToken(projectId);

  const client = new GitLabClient({ token, baseUrl });

  const projectData = await client.getProject(projectPath);

  const commits = await client.getCommits(projectData.id, dateFrom, dateTo);

  const shas = commits.map((c) => c.id);
  const existing = await getExistingSha(projectId, shas);

  let newCount = 0;
  let skippedCount = 0;

  for (const commit of commits) {
    if (existing.has(commit.id)) {
      skippedCount++;
      continue;
    }

    let stats: GitLabCommitStats = {};
    try {
      const fullCommit = await client.request<any>(
        `/projects/${projectData.id}/repository/commits/${commit.id}`
      );
      stats = fullCommit.stats || {};
    } catch {
      // stats unavailable, use zeros
    }

    const additions = stats.additions || 0;
    const deletions = stats.deletions || 0;

    await upsertCommit({
      project_id: projectId,
      commit_sha: commit.id,
      author_name: commit.author_name,
      author_email: commit.author_email,
      committed_date: commit.committed_date,
      additions,
      deletions,
      total_changes: additions + deletions,
      branch: "all",
      raw_json: commit,
    });

    newCount++;
  }

  if (newCount > 0) {
    await refreshContributors(projectId);
  }

  return {
    project_id: projectId,
    project_path: projectPath,
    new_commits: newCount,
    skipped_duplicates: skippedCount,
    total_processed: commits.length,
  };
}
