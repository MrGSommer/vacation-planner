type CacheEntry<T> = {
  data: T;
  timestamp: number;
  promise?: Promise<T>;
};

const cache = new Map<string, CacheEntry<any>>();
const inflight = new Map<string, Promise<any>>();

const FRESH_TTL = 30_000;    // 30s fresh
const STALE_TTL = 120_000;   // 120s stale-while-revalidate

export async function cachedQuery<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl: { fresh?: number; stale?: number } = {},
): Promise<T> {
  const freshMs = ttl.fresh ?? FRESH_TTL;
  const staleMs = ttl.stale ?? STALE_TTL;
  const now = Date.now();
  const entry = cache.get(key);

  // Fresh hit
  if (entry && now - entry.timestamp < freshMs) {
    return entry.data;
  }

  // Stale hit — return stale data, revalidate in background
  if (entry && now - entry.timestamp < staleMs) {
    if (!inflight.has(key)) {
      const p = fetcher().then(data => {
        cache.set(key, { data, timestamp: Date.now() });
        inflight.delete(key);
        return data;
      }).catch(() => {
        inflight.delete(key);
        return entry.data;
      });
      inflight.set(key, p);
    }
    return entry.data;
  }

  // Miss or expired — deduplicate concurrent requests
  if (inflight.has(key)) {
    return inflight.get(key)!;
  }

  const p = fetcher().then(data => {
    cache.set(key, { data, timestamp: Date.now() });
    inflight.delete(key);
    return data;
  }).catch(err => {
    inflight.delete(key);
    // Return stale data if available on error
    if (entry) return entry.data;
    throw err;
  });
  inflight.set(key, p);
  return p;
}

export function invalidateCache(prefix: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
    }
  }
}

export function clearCache(): void {
  cache.clear();
  inflight.clear();
}
