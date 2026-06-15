interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<any>>();
const DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes

export function getCached<T>(key: string): T | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return undefined;
  }
  return entry.data as T;
}

export function setCache<T>(key: string, data: T, ttlMs = DEFAULT_TTL): void {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

export function clearCache(pattern?: string): void {
  if (!pattern) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key.startsWith(pattern)) cache.delete(key);
  }
}
