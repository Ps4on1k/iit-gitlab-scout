import { getPool } from "../db/pool.js";
import { getClickHouse } from "../db/clickhouse.js";

const BATCH_SIZE = 10000;

/**
 * Incremental sync: only sync rows newer than the last sync timestamp.
 * Falls back to full sync if no previous sync exists.
 */
export async function syncTableToClickHouse(
  tableName: string,
  columns: string[],
  dateColumn?: string,
  fullSync = false
): Promise<{ synced: number; incremental: boolean }> {
  const pgPool = getPool();
  const ch = getClickHouse();

  // Check last sync time from ClickHouse
  let lastSync: Date | null = null;
  if (!fullSync && dateColumn) {
    try {
      const result = await ch.query({
        query: `SELECT max(${dateColumn}) as last_sync FROM ${tableName}`,
      });
      const text = await result.text();
      const rows = JSON.parse(text).data;
      if (rows[0]?.last_sync) {
        lastSync = new Date(rows[0].last_sync);
      }
    } catch {
      // Table doesn't exist yet in CH, do full sync
    }
  }

  const conditions: string[] = [];
  const params: any[] = [];
  let idx = 1;

  if (dateColumn && lastSync) {
    conditions.push(`${dateColumn} > $${idx++}`);
    params.push(lastSync.toISOString());
  } else if (dateColumn) {
    conditions.push(`${dateColumn} >= $${idx++}`);
    params.push(new Date(Date.now() - 90 * 86400000).toISOString());
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const countResult = await pgPool.query(
    `SELECT COUNT(*)::int as total FROM ${tableName} ${where}`,
    params
  );
  const total = countResult.rows[0].total;

  if (total === 0) return { synced: 0, incremental: !!lastSync };

  let offset = 0;
  let synced = 0;

  while (offset < total) {
    const query = `SELECT ${columns.join(", ")} FROM ${tableName} ${where} ORDER BY id LIMIT $${idx++} OFFSET $${idx++}`;
    const result = await pgPool.query(query, [...params, BATCH_SIZE, offset]);

    if (result.rows.length === 0) break;

    const rows = result.rows.map((r: any) => {
      const row: Record<string, any> = {};
      for (const col of columns) {
        let val = r[col];
        if (val === null || val === undefined) {
          row[col] = null;
        } else if (typeof val === "object") {
          row[col] = JSON.stringify(val);
        } else {
          row[col] = val;
        }
      }
      return row;
    });

    await ch.insert({
      table: tableName,
      values: rows,
      format: "JSONEachRow",
    });

    synced += rows.length;
    offset += BATCH_SIZE;
  }

  return { synced, incremental: !!lastSync };
}

export async function syncAllToClickHouse(fullSync = false): Promise<Record<string, { synced: number; incremental: boolean }>> {
  const results: Record<string, { synced: number; incremental: boolean }> = {};

  const tables: { name: string; columns: string[]; dateColumn?: string }[] = [
    { name: "commits", columns: ["id", "project_id", "sha", "author_name", "author_email", "message", "committed_date", "additions", "deletions"], dateColumn: "committed_date" },
    { name: "project_merge_requests", columns: ["id", "project_id", "gitlab_iid", "title", "state", "author_name", "author_email", "source_branch", "target_branch", "created_at", "updated_at", "merged_at", "closed_at", "reviewers", "approvals", "changes_count", "comments_count"], dateColumn: "created_at" },
    { name: "project_pipelines", columns: ["id", "project_id", "gitlab_id", "status", "ref", "source", "duration", "created_at", "finished_at", "user_name"], dateColumn: "created_at" },
    { name: "project_deployments", columns: ["id", "project_id", "gitlab_id", "status", "environment", "pipeline_status", "created_at", "finished_at"], dateColumn: "created_at" },
    { name: "project_branches", columns: ["id", "project_id", "name", "merged", "protected", "default", "last_commit_date", "last_commit_author", "last_commit_additions", "last_commit_deletions"] },
    { name: "contributor_profiles", columns: ["id", "project_id", "author_email", "author_name", "total_commits", "total_additions", "total_deletions", "first_commit_date", "last_commit_date"] },
  ];

  for (const table of tables) {
    try {
      const result = await syncTableToClickHouse(table.name, table.columns, table.dateColumn, fullSync);
      results[table.name] = result;
    } catch (err) {
      console.error(`[clickhouse-sync] Error syncing ${table.name}:`, err);
      results[table.name] = { synced: -1, incremental: false };
    }
  }

  return results;
}
