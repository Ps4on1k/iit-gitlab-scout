import type { GitLabClient } from "../services/gitlab-client.js";
import type { GitLabCommit } from "../models/gitlab.js";

export async function* commitIterator(
  client: GitLabClient,
  projectId: number,
  since?: string,
  until?: string
): AsyncGenerator<GitLabCommit> {
  let page = 1;
  const perPage = 100;

  while (true) {
    const params = new URLSearchParams({
      per_page: String(perPage),
      page: String(page),
    });
    if (since) params.set("since", since);
    if (until) params.set("until", until);

    const commits = await client.request<GitLabCommit[]>(
      `/projects/${projectId}/repository/commits?${params}`
    );

    if (commits.length === 0) break;

    for (const commit of commits) {
      yield commit;
    }

    if (commits.length < perPage) break;
    page++;
  }
}
