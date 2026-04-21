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
// Strategy: Online = network-first (fresh data, update cache for offline)
//           Offline = cache-first (localStorage fallback)

export async function cachedQuery<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl: { fresh?: number; stale?: number } = {},
): Promise<T> {
  const freshMs = ttl.fresh ?? FRESH_TTL;
  const now = Date.now();
  const entry = cache.get(key);
  const online = !isWeb() || navigator.onLine;

  // Offline: return best available cached data
  if (!online) {
    if (entry) return entry.data;
    const stored = loadFromStorage<T>(key);
    if (stored) {
      cache.set(key, stored);
      return stored.data;
    }
    // No cached data — try network anyway (might work via SW)
    return fetcher();
  }

  // Online: fresh in-memory hit — return immediately
  if (entry && now - entry.timestamp < freshMs) {
    return entry.data;
  }

  // Online: always fetch fresh data from network
  // Deduplicate concurrent requests for the same key
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
    // Network failed while online — fall back to cache
    if (entry) return entry.data;
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

/** Purge all cached data for a specific trip (memory + localStorage). */
export function purgeTripCache(tripId: string): void {
  for (const key of cache.keys()) {
    if (key.includes(tripId)) {
      cache.delete(key);
    }
  }
  if (isWeb()) {
    const map = getStorageMap();
    let changed = false;
    for (const key of Object.keys(map)) {
      if (key.includes(tripId)) {
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

// --- Online sync: purge stale localStorage entries ---
// Call this when the app comes back online to remove stale cached data.
// Entries older than maxAge are deleted so offline cache stays current.

const PURGE_MAX_AGE = 5 * 60_000; // 5 minutes — anything older gets purged on reconnect

export function purgeStaleStorage(): void {
  if (!isWeb()) return;
  const map = getStorageMap();
  const now = Date.now();
  let changed = false;
  for (const key of Object.keys(map)) {
    if (now - map[key].timestamp > PURGE_MAX_AGE) {
      delete map[key];
      // Also clear in-memory cache for this key
      cache.delete(key);
      changed = true;
    }
  }
  if (changed) saveStorageMap(map);
}

// Auto-purge when browser comes back online
if (isWeb()) {
  window.addEventListener('online', () => {
    purgeStaleStorage();
  });
}
