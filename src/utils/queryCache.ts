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
// All cache entries stored in a single localStorage key as one object

const STORAGE_KEY = 'wf_cache';

type StorageMap = Record<string, { data: any; timestamp: number }>;

function isWeb(): boolean {
  return Platform.OS === 'web';
}

let _storageCache: StorageMap | null = null;

function getStorageMap(): StorageMap {
  if (_storageCache) return _storageCache;
  if (!isWeb()) return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    _storageCache = raw ? JSON.parse(raw) : {};
    return _storageCache!;
  } catch {
    _storageCache = {};
    return _storageCache;
  }
}

function saveStorageMap(map: StorageMap): void {
  if (!isWeb()) return;
  _storageCache = map;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // QuotaExceeded — try to trim oldest entries
    try {
      const entries = Object.entries(map);
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      // Remove oldest 25%
      const trimmed = Object.fromEntries(entries.slice(Math.floor(entries.length * 0.25)));
      _storageCache = trimmed;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch {
      // Give up silently
    }
  }
}

function persistToStorage(key: string, data: any): void {
  if (!isWeb()) return;
  const map = getStorageMap();
  map[key] = { data, timestamp: Date.now() };
  saveStorageMap(map);
}

export function loadFromStorage<T>(key: string): CacheEntry<T> | null {
  if (!isWeb()) return null;
  try {
    const map = getStorageMap();
    const entry = map[key];
    if (entry && entry.data !== undefined && entry.timestamp) {
      return { data: entry.data, timestamp: entry.timestamp };
    }
    return null;
  } catch {
    return null;
  }
}

function removeFromStorage(key: string): void {
  if (!isWeb()) return;
  const map = getStorageMap();
  delete map[key];
  saveStorageMap(map);
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
    const map = getStorageMap();
    let changed = false;
    for (const key of Object.keys(map)) {
      if (key.startsWith(prefix)) {
        delete map[key];
        changed = true;
      }
    }
    if (changed) saveStorageMap(map);
  }
}

export function clearCache(): void {
  cache.clear();
  inflight.clear();
  _storageCache = null;
  if (isWeb()) {
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  }
}
