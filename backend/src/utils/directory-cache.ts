import { getPool } from "../db/pool.js";

interface DirectoryEntry {
  display_name: string;
  emails: string[];
}

let cachedDir: DirectoryEntry[] | null = null;
let cacheExpiry = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function getContributorDirectory(): Promise<DirectoryEntry[]> {
  const now = Date.now();
  if (cachedDir && now < cacheExpiry) return cachedDir;

  const pool = getPool();
  const result = await pool.query("SELECT display_name, emails FROM contributor_directory");
  cachedDir = result.rows;
  cacheExpiry = now + CACHE_TTL;
  return cachedDir;
}

export function invalidateDirectoryCache(): void {
  cachedDir = null;
  cacheExpiry = 0;
}

export function buildEmailToNameMap(dir: DirectoryEntry[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const row of dir) {
    for (const email of row.emails) {
      map[email] = row.display_name;
    }
  }
  return map;
}

export function buildNameToEmailMap(dir: DirectoryEntry[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const row of dir) {
    if (row.emails.length > 0) {
      map[row.display_name] = row.emails[0];
    }
  }
  return map;
}
