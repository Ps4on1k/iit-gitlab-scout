import { getPool } from "./pool.js";

export interface StackFilters {
  project_ids?: number[];
  tag?: string[];
  language?: string[];
}

export interface ProjectLanguage {
  project_id: number;
  project_path: string;
  project_label: string;
  project_tag: string;
  language: string;
  bytes: number;
  percentage: number;
}

export interface LanguageSummary {
  language: string;
  total_percentage: number;
  project_count: number;
  percentage: number;
}

export async function getLanguages(filters: StackFilters): Promise<ProjectLanguage[]> {
  const pool = getPool();
  const conditions: string[] = [];
  const params: any[] = [];
  let idx = 1;

  if (filters.project_ids && filters.project_ids.length > 0) {
    conditions.push(`pl.project_id = ANY($${idx++})`);
    params.push(filters.project_ids);
  }
  if (filters.tag && filters.tag.length > 0) {
    conditions.push(`p.tag = ANY($${idx++})`);
    params.push(filters.tag);
  }
  if (filters.language && filters.language.length > 0) {
    conditions.push(`pl.language = ANY($${idx++})`);
    params.push(filters.language);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const result = await pool.query(
    `SELECT pl.project_id, p.path as project_path, p.label as project_label, p.tag as project_tag,
            pl.language, pl.bytes, pl.percentage
     FROM project_languages pl
     JOIN projects p ON p.id = pl.project_id
     ${where}
     ORDER BY pl.project_id, pl.percentage DESC`,
    params
  );
  return result.rows;
}

export async function getLanguageSummary(filters: StackFilters): Promise<LanguageSummary[]> {
  const pool = getPool();
  const conditions: string[] = [];
  const params: any[] = [];
  let idx = 1;

  if (filters.project_ids && filters.project_ids.length > 0) {
    conditions.push(`pl.project_id = ANY($${idx++})`);
    params.push(filters.project_ids);
  }
  if (filters.tag && filters.tag.length > 0) {
    conditions.push(`p.tag = ANY($${idx++})`);
    params.push(filters.tag);
  }
  if (filters.language && filters.language.length > 0) {
    conditions.push(`pl.language = ANY($${idx++})`);
    params.push(filters.language);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const result = await pool.query(
    `SELECT pl.language,
            SUM(pl.percentage)::numeric(10,2) as total_percentage,
            COUNT(DISTINCT pl.project_id) as project_count
     FROM project_languages pl
     JOIN projects p ON p.id = pl.project_id
     ${where}
     GROUP BY pl.language
     ORDER BY total_percentage DESC`,
    params
  );

  const totalPct = result.rows.reduce((s, r) => s + Number(r.total_percentage), 0);
  return result.rows.map((r) => ({
    language: r.language,
    total_percentage: Number(r.total_percentage),
    project_count: Number(r.project_count),
    percentage: totalPct > 0 ? Math.round((Number(r.total_percentage) / totalPct) * 10000) / 100 : 0,
  }));
}
