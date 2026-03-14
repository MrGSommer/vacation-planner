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

/** Cache a single document URL. No-op if already cached. */
export async function cacheDocument(url: string): Promise<void> {
  if (!isSupported() || !url) return;
  try {
    const cache = await caches.open(DOCS_CACHE);
    const existing = await cache.match(url);
    if (existing) return;
    const response = await fetch(url);
    if (response.ok) {
      await cache.put(url, response);
    }
  } catch {
    // Silent — best-effort caching
  }
}

/** Cache multiple document URLs in parallel (throttled). */
export async function cacheDocuments(urls: string[]): Promise<void> {
  if (!isSupported()) return;
  const BATCH = 4;
  for (let i = 0; i < urls.length; i += BATCH) {
    await Promise.all(urls.slice(i, i + BATCH).map(cacheDocument));
  }
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
 * Offline: fetches from cache, creates blob URL, opens in new tab.
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

  // Offline: serve from cache
  try {
    const cache = await caches.open(DOCS_CACHE);
    const cached = await cache.match(url);
    if (cached) {
      const blob = await cached.blob();
      const objectUrl = URL.createObjectURL(blob);
      window.open(objectUrl, '_blank');
      // Clean up after a delay (browser needs time to start loading)
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
      return;
    }
  } catch {
    // Fall through
  }

  // Also check the SW's main cache as fallback
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
