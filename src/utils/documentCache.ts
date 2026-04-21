import { Platform } from 'react-native';

/**
 * Persistent document cache using the Cache API.
 * Uses a dedicated cache ('wayfable-docs') that survives SW version bumps.
 * Documents are cached on upload and during prefetch, then served from
 * cache when offline — bypassing the need for Supabase Storage URLs.
 */

const DOCS_CACHE = 'wayfable-docs';

function isSupported(): boolean {
  return Platform.OS === 'web' && 'caches' in window;
}

/**
 * Cache a single document URL into wayfable-docs.
 * Uses mode: 'cors' + credentials: 'omit' for cross-origin Supabase Storage.
 * Returns true if cached successfully, false otherwise.
 */
export async function cacheDocument(url: string): Promise<boolean> {
  if (!isSupported() || !url) return false;
  try {
    const cache = await caches.open(DOCS_CACHE);
    const existing = await cache.match(url);
    if (existing) return true;

    // Explicit CORS + omit credentials for Supabase Storage public URLs
    const response = await fetch(url, {
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-cache', // bypass browser HTTP cache to get fresh response
    });

    if (!response.ok) {
      console.warn(`[DocCache] fetch failed: ${response.status} ${response.statusText} for ${url.slice(0, 80)}`);
      return false;
    }

    // Clone before consuming — safety against double-read
    await cache.put(url, response.clone());

    // Verify it was actually stored
    const verify = await cache.match(url);
    if (!verify) {
      console.warn(`[DocCache] put succeeded but verify failed for ${url.slice(0, 80)}`);
      return false;
    }

    return true;
  } catch (err) {
    console.warn(`[DocCache] error caching ${url.slice(0, 80)}:`, err);
    return false;
  }
}

/** Cache multiple document URLs in parallel (throttled). Returns count of successfully cached. */
export async function cacheDocuments(urls: string[]): Promise<number> {
  if (!isSupported()) return 0;
  let cached = 0;
  const BATCH = 4;
  for (let i = 0; i < urls.length; i += BATCH) {
    const results = await Promise.all(urls.slice(i, i + BATCH).map(cacheDocument));
    cached += results.filter(Boolean).length;
  }
  if (urls.length > 0) {
    console.log(`[DocCache] cached ${cached}/${urls.length} documents`);
  }
  return cached;
}

/** Check if a document URL is in cache. */
export async function isDocumentCached(url: string): Promise<boolean> {
  if (!isSupported() || !url) return false;
  try {
    const cache = await caches.open(DOCS_CACHE);
    const match = await cache.match(url);
    return !!match;
  } catch {
    return false;
  }
}

/**
 * Open a document, serving from cache when offline.
 * Online: opens URL directly (fast, uses CDN).
 * Offline: fetches from wayfable-docs cache, then falls back to SW cache.
 */
export async function openDocument(url: string, fileName?: string): Promise<void> {
  if (Platform.OS !== 'web') {
    const { Linking } = require('react-native');
    Linking.openURL(url);
    return;
  }

  // Online: try direct URL first, it's faster
  if (navigator.onLine) {
    window.open(url, '_blank');
    return;
  }

  // Offline: serve from wayfable-docs cache
  try {
    const cache = await caches.open(DOCS_CACHE);
    const cached = await cache.match(url);
    if (cached) {
      const blob = await cached.blob();
      const objectUrl = URL.createObjectURL(blob);
      window.open(objectUrl, '_blank');
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
      return;
    }
  } catch {
    // Fall through
  }

  // Also check ALL other caches as fallback (SW versioned caches etc.)
  try {
    const keys = await caches.keys();
    for (const key of keys) {
      if (key === DOCS_CACHE) continue;
      const cache = await caches.open(key);
      const cached = await cache.match(url);
      if (cached) {
        const blob = await cached.blob();
        const objectUrl = URL.createObjectURL(blob);
        window.open(objectUrl, '_blank');
        setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
        return;
      }
    }
  } catch {
    // Fall through
  }

  // Nothing cached — show error
  if (typeof alert !== 'undefined') {
    alert(`"${fileName || 'Dokument'}" ist offline nicht verfügbar. Bitte verbinde dich mit dem Internet.`);
  }
}

/** Remove multiple document URLs from cache (e.g. when disabling offline for a trip). */
export async function uncacheTripDocuments(urls: string[]): Promise<void> {
  if (!isSupported() || urls.length === 0) return;
  try {
    const cache = await caches.open(DOCS_CACHE);
    await Promise.all(urls.map(url => cache.delete(url)));
  } catch {
    // Silent
  }
}

/** Remove a specific document from cache (e.g. after deletion). */
export async function uncacheDocument(url: string): Promise<void> {
  if (!isSupported() || !url) return;
  try {
    const cache = await caches.open(DOCS_CACHE);
    await cache.delete(url);
  } catch {
    // Silent
  }
}
