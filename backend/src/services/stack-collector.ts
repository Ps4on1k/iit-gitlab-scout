import { getPool } from "../db/pool.js";
import { resolveProjectToken } from "../utils/project-token.js";
import { GitLabClient } from "./gitlab-client.js";

interface GitLabLanguage {
  [key: string]: number;
}

export interface CollectStackResult {
  project_id: number;
  path: string;
  languages: { language: string; percentage: number }[];
}

export async function collectStack(projectId: number): Promise<CollectStackResult> {
  const pool = getPool();
  const { token, baseUrl, path: projectPath } = await resolveProjectToken(projectId);

  const client = new GitLabClient({ token, baseUrl });

  let languages: { language: string; percentage: number }[] = [];
  try {
    const langData = await client.request<GitLabLanguage>(
      `/projects/${encodeURIComponent(projectPath)}/languages`
    );
    languages = Object.entries(langData)
      .map(([language, percentage]) => ({
        language,
        percentage: Math.round(Number(percentage) * 100) / 100,
      }))
      .sort((a, b) => b.percentage - a.percentage);
  } catch {
    // languages unavailable
  }

  await pool.query("DELETE FROM project_languages WHERE project_id = $1", [projectId]);
  for (const lang of languages) {
    await pool.query(
      "INSERT INTO project_languages (project_id, language, bytes, percentage) VALUES ($1, $2, $3, $4)",
      [projectId, lang.language, 0, lang.percentage]
    );
  }

  return { project_id: projectId, path: projectPath, languages };
}
