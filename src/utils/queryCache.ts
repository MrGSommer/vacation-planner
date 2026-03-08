import { Platform } from 'react-native';

type CacheEntry<T> = {
  data: T;
  timestamp: number;
  promise?: Promise<T>;
};

const cache = new Map<string, CacheEntry<any>>();
const inflight = new Map<string, Promise<any>>();

const FRESH_TTL = 30_000;    // 30s fresh
const STALE_TTL = 120_000;   // 120s stale-while-revalidate

// --- localStorage persistence (web only) ---

const STORAGE_PREFIX = 'wf_cache:';
const MANIFEST_KEY = 'wf_cache:__keys__';

function isWeb(): boolean {
  return Platform.OS === 'web';
}

function getManifest(): string[] {
  if (!isWeb()) return [];
  try {
    const raw = localStorage.getItem(MANIFEST_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function addToManifest(key: string): void {
  if (!isWeb()) return;
  try {
    const keys = getManifest();
    if (!keys.includes(key)) {
      keys.push(key);
      localStorage.setItem(MANIFEST_KEY, JSON.stringify(keys));
    }
  } catch {}
}

function removeFromManifest(key: string): void {
  if (!isWeb()) return;
  try {
    const keys = getManifest().filter(k => k !== key);
    localStorage.setItem(MANIFEST_KEY, JSON.stringify(keys));
  } catch {}
}

function persistToStorage(key: string, data: any): void {
  if (!isWeb()) return;
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify({ data, timestamp: Date.now() }));
    addToManifest(key);
  } catch {
    // QuotaExceeded or other error — silently ignore
  }
}

export function loadFromStorage<T>(key: string): CacheEntry<T> | null {
  if (!isWeb()) return null;
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.data !== undefined && parsed.timestamp) {
      return { data: parsed.data, timestamp: parsed.timestamp };
    }
    return null;
  } catch {
    return null;
  }
}

function removeFromStorage(key: string): void {
  if (!isWeb()) return;
  try {
    localStorage.removeItem(STORAGE_PREFIX + key);
    removeFromManifest(key);
  } catch {}
}

// --- cachedQuery ---

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
        persistToStorage(key, data);
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

  // Miss or expired — check localStorage before network
  if (!entry && isWeb()) {
    const stored = loadFromStorage<T>(key);
    if (stored) {
      // Offline: return persisted data directly
      if (!navigator.onLine) {
        cache.set(key, stored);
        return stored.data;
      }
      // Online: use persisted as stale, revalidate in background
      cache.set(key, stored);
      if (!inflight.has(key)) {
        const p = fetcher().then(data => {
          cache.set(key, { data, timestamp: Date.now() });
          persistToStorage(key, data);
          inflight.delete(key);
          return data;
        }).catch(() => {
          inflight.delete(key);
          return stored.data;
        });
        inflight.set(key, p);
      }
      return stored.data;
    }
  }

  // Deduplicate concurrent requests
  if (inflight.has(key)) {
    return inflight.get(key)!;
  }

  const p = fetcher().then(data => {
    cache.set(key, { data, timestamp: Date.now() });
    persistToStorage(key, data);
    inflight.delete(key);
    return data;
  }).catch(err => {
    inflight.delete(key);
    // Return stale data if available on error
    if (entry) return entry.data;
    // Try localStorage as last resort
    const stored = loadFromStorage<T>(key);
    if (stored) {
      cache.set(key, stored);
      return stored.data;
    }
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
  // Also remove from localStorage
  if (isWeb()) {
    for (const key of getManifest()) {
      if (key.startsWith(prefix)) {
        removeFromStorage(key);
      }
    }
  }
}

export function clearCache(): void {
  cache.clear();
  inflight.clear();
  // Clear all localStorage cache entries
  if (isWeb()) {
    for (const key of getManifest()) {
      try { localStorage.removeItem(STORAGE_PREFIX + key); } catch {}
    }
    try { localStorage.removeItem(MANIFEST_KEY); } catch {}
  }
}
