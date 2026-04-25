import { Platform } from 'react-native';
import { ActivityDocument } from '../types/database';
import { blobStore } from './blobStore';
import {
  upsertDocumentMeta,
  getDocumentMeta,
  markSyncState,
  deleteTripDocuments,
  deleteDocumentMeta,
  getTripDocuments,
  clearAllDocuments,
} from './documentStore';
import { syncTripDocuments, retryDocument } from './documentSync';

/**
 * Thin public API that other modules (DocumentPicker, prefetch, OfflineSyncContext)
 * use to manage offline document availability. Internally delegates to:
 *   - blobStore       → OPFS/IDB blob bytes
 *   - documentStore   → Dexie metadata + sync-state
 *   - documentSync    → Sync-Engine with state-machine
 *
 * Legacy Cache API (`wayfable-docs`) is migrated on-demand via
 * `migrateLegacyCacheForDoc(url, docId)` — called from cacheDocument the first
 * time we encounter a known doc. The legacy cache is deleted once empty.
 */

const LEGACY_DOCS_CACHE = 'wayfable-docs';

function isWeb(): boolean {
  return Platform.OS === 'web';
}

function isSupported(): boolean {
  return isWeb() && 'indexedDB' in window;
}

// Convert ActivityDocument.created_at (ISO string) → ms epoch for server_updated_at
function toEpoch(iso: string | undefined | null): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

/**
 * Register + sync a single document for offline use.
 * Idempotent. Safe to call on every load — no-op if already synced with matching hash.
 *
 * Returns true if the document ended up in the local blob store.
 */
export async function cacheDocument(
  doc: ActivityDocument,
  opts: { priority?: number } = {},
): Promise<boolean> {
  if (!isSupported() || !doc?.url) return false;

  await upsertDocumentMeta({
    id: doc.id,
    trip_id: doc.trip_id,
    activity_id: doc.activity_id,
    url: doc.url,
    filename: doc.file_name,
    mime_type: doc.file_type,
    server_updated_at: toEpoch(doc.created_at),
    priority: opts.priority ?? 0,
  });

  // Legacy migration: if we have a copy in Cache API, move it to blobStore
  // before triggering network sync. This preserves offline access even if
  // network is currently down.
  await migrateLegacyCacheForDoc(doc).catch(() => {});

  if (!navigator.onLine) {
    // Offline: leave in pending/stale state; next online sync picks it up.
    return blobStore.exists(doc.id);
  }

  // Trigger sync for just this doc (via retry, which syncs only this id)
  const ok = await retryDocument(doc.id).catch(() => false);
  return ok;
}

/** Bulk-register + sync. Delegates to syncTripDocuments for efficiency. */
export async function cacheDocuments(
  docs: ActivityDocument[],
  opts: { priority?: (doc: ActivityDocument) => number; abortSignal?: AbortSignal } = {},
): Promise<number> {
  if (!isSupported() || docs.length === 0) return 0;

  const tripIds = new Set<string>();
  for (const doc of docs) {
    tripIds.add(doc.trip_id);
    await upsertDocumentMeta({
      id: doc.id,
      trip_id: doc.trip_id,
      activity_id: doc.activity_id,
      url: doc.url,
      filename: doc.file_name,
      mime_type: doc.file_type,
      server_updated_at: toEpoch(doc.created_at),
      priority: opts.priority?.(doc) ?? 0,
    });
    await migrateLegacyCacheForDoc(doc).catch(() => {});
  }

  if (!navigator.onLine) return 0;

  let succeeded = 0;
  for (const tripId of tripIds) {
    const r = await syncTripDocuments(tripId, { abortSignal: opts.abortSignal });
    succeeded += r.succeeded.length + r.skipped.length;
  }
  return succeeded;
}

/** True iff blob is locally available (regardless of sync_state). */
export async function isDocumentCached(docId: string): Promise<boolean> {
  if (!isSupported()) return false;
  return blobStore.exists(docId);
}

/** Read the blob for a document. null if not cached. */
export async function getDocumentBlob(docId: string): Promise<Blob | null> {
  if (!isSupported()) return null;
  return blobStore.read(docId);
}

/**
 * Remove one document from offline storage (blob + metadata).
 * Called on document deletion or individual toggle-off.
 */
export async function uncacheDocument(docId: string): Promise<void> {
  if (!isSupported()) return;
  await blobStore.delete(docId).catch(() => {});
  await deleteDocumentMeta(docId);
}

/** Remove every offline artifact for a trip (blobs + metadata). */
export async function uncacheTripDocuments(tripId: string): Promise<void> {
  if (!isSupported()) return;
  const docs = await getTripDocuments(tripId);
  for (const doc of docs) {
    await blobStore.delete(doc.id).catch(() => {});
  }
  await deleteTripDocuments(tripId);
}

/** Nuke everything — used on logout. */
export async function clearAllCachedDocuments(): Promise<void> {
  if (!isSupported()) return;
  await blobStore.clearAll().catch(() => {});
  await clearAllDocuments();
  if ('caches' in window) {
    await caches.delete(LEGACY_DOCS_CACHE).catch(() => {});
  }
}

// ─── Legacy Cache-API Migration ────────────────────────────────────────────

/**
 * If a document's URL lives in the legacy `wayfable-docs` Cache API, copy its
 * blob to blobStore and mark it synced. Runs once per doc (hash + synced_at
 * get set, so subsequent calls short-circuit).
 *
 * This keeps users who were offline when the app updated from losing their
 * pre-cached documents.
 */
async function migrateLegacyCacheForDoc(doc: ActivityDocument): Promise<boolean> {
  if (!('caches' in window)) return false;
  try {
    const existing = await getDocumentMeta(doc.id);
    if (existing?.sync_state === 'synced' && existing.hash) return false;

    const cache = await caches.open(LEGACY_DOCS_CACHE);
    const cached = await cache.match(doc.url);
    if (!cached) return false;

    const blob = await cached.blob();
    await blobStore.write(doc.id, blob);

    // Hash the blob so future syncs can skip-check
    const buf = await blob.arrayBuffer();
    const hashBuf = await crypto.subtle.digest('SHA-256', buf);
    const hash = Array.from(new Uint8Array(hashBuf))
      .map(b => b.toString(16).padStart(2, '0')).join('');

    await markSyncState(doc.id, 'synced', {
      hash,
      synced_at: Date.now(),
      retry_count: 0,
      last_error: null,
    });
    // Remove from legacy cache — one less source of truth
    await cache.delete(doc.url).catch(() => {});
    return true;
  } catch {
    return false;
  }
}

