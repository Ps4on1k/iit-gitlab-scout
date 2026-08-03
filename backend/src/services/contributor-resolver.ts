import { getPool } from "../db/pool.js";

/**
 * ARCH-04: Contributor resolver.
 * Maps (email, name) signatures to canonical GitLab user_id.
 * Priority: gitlab_user_id > contributor_directory explicit mapping > email match > heuristics.
 */

export interface ResolvedContributor {
  userId: number;           // gitlab user id (canonical)
  displayName: string;      // canonical display name (from directory or gitlab)
  emails: string[];         // all known emails for this user
  isVerified: boolean;      // was manually verified in directory
}

let cache: Map<string, ResolvedContributor> | null = null;
let cacheAt = 0;
const CACHE_TTL = 60_000;

async function loadDirectory(): Promise<Map<number, { displayName: string; emails: string[]; isValid: boolean }>> {
  const pool = getPool();
  const rows = await pool.query(`
    SELECT gitlab_user_id, display_name, emails, is_valid FROM contributor_directory
    WHERE gitlab_user_id IS NOT NULL
  `);
  const map = new Map<number, { displayName: string; emails: string[]; isValid: boolean }>();
  for (const r of rows.rows) {
    map.set(r.gitlab_user_id, { displayName: r.display_name, emails: r.emails || [], isValid: r.is_valid });
  }
  return map;
}

async function loadEmailToUser(): Promise<Map<string, number>> {
  const pool = getPool();
  const rows = await pool.query(`
    SELECT gitlab_user_id, email FROM contributor_directory_emails
     WHERE gitlab_user_id IS NOT NULL
  `);
  return new Map(rows.rows.map((r: any) => [r.email.toLowerCase(), r.gitlab_user_id]));
}

export function invalidateContributorCache(): void {
  cache = null;
}

export async function resolveByEmail(email: string, name?: string): Promise<ResolvedContributor | null> {
  if (!cache || Date.now() - cacheAt > CACHE_TTL) {
    cache = new Map();
    cacheAt = Date.now();

    const directory = await loadDirectory();
    const emailToUser = await loadEmailToUser();

    // Build cache keyed by email
    for (const [emailLower, userId] of emailToUser) {
      const dir = directory.get(userId);
      if (dir) {
        cache.set(emailLower, {
          userId,
          displayName: dir.displayName,
          emails: dir.emails,
          isVerified: dir.isValid,
        });
      }
    }

    // Also index by display_name lowercase for lookup
    for (const [uid, dir] of directory) {
      const key = dir.displayName.toLowerCase();
      if (!cache.has(key)) {
        cache.set(key, {
          userId: uid,
          displayName: dir.displayName,
          emails: dir.emails,
          isVerified: dir.isValid,
        });
      }
    }
  }

  const lower = (email || "").toLowerCase();
  const byEmail = cache.get(lower);
  if (byEmail) return byEmail;

  if (name) {
    const byName = cache.get(name.toLowerCase());
    if (byName) return byName;
  }

  return null;
}

export async function resolveByUserIds(userIds: number[]): Promise<Map<number, ResolvedContributor>> {
  const result = new Map<number, ResolvedContributor>();
  const directory = await loadDirectory();
  for (const uid of userIds) {
    const dir = directory.get(uid);
    if (dir) {
      result.set(uid, {
        userId: uid,
        displayName: dir.displayName,
        emails: dir.emails,
        isVerified: dir.isValid,
      });
    }
  }
  return result;
}
