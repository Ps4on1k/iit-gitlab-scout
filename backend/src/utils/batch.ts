import { getPool } from "../db/pool.js";

/**
 * Batch insert multiple rows using a single query.
 * @param table - target table name
 * @param columns - column names
 * @param rows - array of row values (each row is an array of values matching columns)
 * @param onConflict - optional ON CONFLICT clause (e.g. "DO NOTHING" or "DO UPDATE SET ...")
 */
export async function batchInsert(
  table: string,
  columns: string[],
  rows: any[][],
  onConflict?: string
): Promise<{ rowCount: number }> {
  if (rows.length === 0) return { rowCount: 0 };

  const pool = getPool();
  const colCount = columns.length;
  const valuePlaceholders: string[] = [];
  const flatValues: any[] = [];
  let idx = 1;

  for (const row of rows) {
    const placeholders: string[] = [];
    for (let i = 0; i < colCount; i++) {
      placeholders.push(`$${idx++}`);
      flatValues.push(row[i]);
    }
    valuePlaceholders.push(`(${placeholders.join(", ")})`);
  }

  const conflictClause = onConflict ? ` ON CONFLICT ${onConflict}` : "";
  const sql = `INSERT INTO ${table} (${columns.join(", ")}) VALUES ${valuePlaceholders.join(", ")}${conflictClause}`;

  const result = await pool.query(sql, flatValues);
  return { rowCount: result.rowCount || 0 };
}

/**
 * Batch upsert: insert rows with ON CONFLICT DO UPDATE for each specified column.
 */
export async function batchUpsert(
  table: string,
  columns: string[],
  rows: any[][],
  conflictTarget: string,
  updateColumns: string[]
): Promise<{ rowCount: number }> {
  if (rows.length === 0) return { rowCount: 0 };

  const updateSet = updateColumns.map((col, i) => {
    const colIdx = columns.indexOf(col);
    return `${col} = EXCLUDED.${col}`;
  }).join(", ");

  return batchInsert(table, columns, rows, `(${conflictTarget}) DO UPDATE SET ${updateSet}`);
}
