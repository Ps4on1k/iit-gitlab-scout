interface CacheEntry<T> {
  data: T;
  expiresAt: number;
  lastAccess: number;
}

const MAX_CACHE_SIZE = 1000;
const cache = new Map<string, CacheEntry<any>>();
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

function evictOldest(): void {
  if (cache.size <= MAX_CACHE_SIZE) return;
  let oldestKey: string | null = null;
  let oldestTime = Infinity;
  for (const [key, entry] of cache) {
    if (entry.lastAccess < oldestTime) {
      oldestTime = entry.lastAccess;
      oldestKey = key;
    }
  }
  if (oldestKey) cache.delete(oldestKey);
}

function startCleanup(): void {
  if (cleanupInterval) return;
  cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of cache) {
      if (now > entry.expiresAt) cache.delete(key);
    }
  }, 60_000);
}

export function getCached<T>(key: string): T | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return undefined;
  }
  entry.lastAccess = Date.now();
  return entry.data as T;
}

export function setCache<T>(key: string, data: T, ttlMs = 60_000): void {
  startCleanup();
  evictOldest();
  cache.set(key, { data, expiresAt: Date.now() + ttlMs, lastAccess: Date.now() });
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

export function cacheKey(...parts: (string | number | undefined)[]): string {
  return parts.filter((p) => p !== undefined && p !== "").join(":");
}
