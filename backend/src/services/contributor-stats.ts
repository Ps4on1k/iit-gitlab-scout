import type { GitLabClient } from "../services/gitlab-client.js";
import type {
  ContributorStats,
  CommitWithDiff,
} from "../models/responses.js";

export interface ContributorFilters {
  month?: string;
  author?: string;
}

export async function getContributorStats(
  client: GitLabClient,
  projectId: number,
  filters: ContributorFilters
): Promise<ContributorStats[]> {
  const since = filters.month ? `${filters.month}-01T00:00:00Z` : undefined;
  const until = filters.month
    ? `${filters.month}-28T23:59:59Z`
    : undefined;

  const commits = await client.getCommits(projectId, since, until);

  const byAuthor = new Map<
    string,
    {
      email: string;
      commits: typeof commits;
      frequency: Record<string, number>;
      first: string;
      last: string;
    }
  >();

  for (const commit of commits) {
    if (filters.author && commit.author_name !== filters.author) continue;

    const existing = byAuthor.get(commit.author_name);
    const day = commit.authored_date.slice(0, 10);

    if (existing) {
      existing.commits.push(commit);
      existing.frequency[day] = (existing.frequency[day] || 0) + 1;
      if (commit.authored_date < existing.first)
        existing.first = commit.authored_date;
      if (commit.authored_date > existing.last)
        existing.last = commit.authored_date;
    } else {
      byAuthor.set(commit.author_name, {
        email: commit.author_email,
        commits: [commit],
        frequency: { [day]: 1 },
        first: commit.authored_date,
        last: commit.authored_date,
      });
    }
  }

  return Array.from(byAuthor.entries()).map(([name, data]) => ({
    author_name: name,
    author_email: data.email,
    total_commits: data.commits.length,
    frequency: data.frequency,
    first_commit_date: data.first,
    last_commit_date: data.last,
  }));
}

export async function getCommitWithDiff(
  client: GitLabClient,
  projectId: number,
  commitSha: string
): Promise<CommitWithDiff> {
  const commits = await client.getCommits(projectId);
  const commit = commits.find((c) => c.id === commitSha);
  if (!commit) throw new Error(`Commit ${commitSha} not found`);

  const diffs = await client.getCommitDiff(projectId, commitSha);
  return { commit, diffs };
}
