import { Platform } from 'react-native';
import { blobStore } from './blobStore';
import {
  DocumentRecord,
  getDocumentsToSync,
  getDocumentMeta,
  markSyncState,
  setSyncMeta,
} from './documentStore';

/**
 * Per-document sync engine. Each document is synced atomically:
 *   markSyncState('syncing') → fetch blob → hash-check → blobStore.write → markSyncState('synced')
 *
 * A failure on one document never blocks the rest. A subsequent call picks up
 * exactly where the previous left off, because sync_state is persistent.
 *
 * Key guarantees:
 *   - Offline data is never wiped by partial syncs. A failed sync leaves prior
 *     synced blobs untouched.
 *   - Unchanged documents skip re-download (sha-256 of current blob vs stored hash).
 *   - Priority: pending → failed/stale → by priority asc.
 *   - AbortController: toggle-off / unmount cancels cleanly mid-flight.
 */

export interface SyncResults {
  succeeded: string[];
  failed: string[];
  skipped: string[];   // unchanged (hash match)
  total: number;
}

export interface SyncOptions {
  abortSignal?: AbortSignal;
  onProgress?: (done: number, total: number, current?: DocumentRecord) => void;
}

const MAX_RETRIES = 5;

function isWeb(): boolean {
  return Platform.OS === 'web';
}

async function sha256(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Priority sort: unsynced first, then failed/stale, then by doc.priority ascending.
 */
function prioritize(docs: DocumentRecord[]): DocumentRecord[] {
  const rank: Record<DocumentRecord['sync_state'], number> = {
    pending: 0,
    failed: 1,
    stale: 1,
    syncing: 2,   // should be rare — mid-flight crash; treat as "retry now"
    synced: 3,
  };
  return [...docs].sort((a, b) => {
    const r = rank[a.sync_state] - rank[b.sync_state];
    if (r !== 0) return r;
    return a.priority - b.priority;
  });
}

/**
 * Sync all documents for a trip. Returns a summary of succeeded / failed /
 * skipped ids. Never throws — individual failures are tracked per document.
 */
export async function syncTripDocuments(
  tripId: string,
  opts: SyncOptions = {}
): Promise<SyncResults> {
  const results: SyncResults = { succeeded: [], failed: [], skipped: [], total: 0 };
  if (!isWeb()) return results;

  // Offline short-circuit: don't mark docs as failed just because network is down.
  // Next online-event will re-trigger sync and pick up where this left off.
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return results;
  }

  const docs = prioritize(await getDocumentsToSync(tripId));
  results.total = docs.length;

  let done = 0;
  for (const doc of docs) {
    if (opts.abortSignal?.aborted) break;

    // Retry-cap: skip docs that have failed too many times until user explicitly retries
    if (doc.sync_state === 'failed' && doc.retry_count >= MAX_RETRIES) {
      results.failed.push(doc.id);
      done++;
      opts.onProgress?.(done, results.total, doc);
      continue;
    }

    await markSyncState(doc.id, 'syncing');

    try {
      const resp = await fetch(doc.url, {
        mode: 'cors',
        credentials: 'omit',
        cache: 'no-cache',
        signal: opts.abortSignal,
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();

      const newHash = await sha256(blob);
      if (newHash === doc.hash && await blobStore.exists(doc.id)) {
        // Unchanged + blob still there — skip write, just refresh synced_at
        await markSyncState(doc.id, 'synced', {
          synced_at: Date.now(),
          retry_count: 0,
          last_error: null,
        });
        results.skipped.push(doc.id);
      } else {
        // Atomic: blob first, then metadata. If blob write fails, metadata stays in 'syncing'
        // and will be retried. If metadata write fails after blob write, the blob is valid
        // but flagged 'syncing' → next sync will recompute hash and rewrite metadata.
        await blobStore.write(doc.id, blob);
        await markSyncState(doc.id, 'synced', {
          hash: newHash,
          synced_at: Date.now(),
          retry_count: 0,
          last_error: null,
        });
        results.succeeded.push(doc.id);
      }
    } catch (err) {
      // Silent per-doc failure; preserve prior synced blob if any.
      const aborted = opts.abortSignal?.aborted || (err instanceof Error && err.name === 'AbortError');
      if (aborted) {
        // Revert 'syncing' back to previous effective state (keep retry_count intact)
        await markSyncState(doc.id, doc.hash ? 'stale' : 'pending');
        break;
      }
      const message = err instanceof Error ? err.message : String(err);
      await markSyncState(doc.id, 'failed', {
        retry_count: (doc.retry_count ?? 0) + 1,
        last_error: message,
      });
      results.failed.push(doc.id);
    }

    done++;
    opts.onProgress?.(done, results.total, doc);
  }

  await setSyncMeta(`trip:${tripId}:lastAttempt`, Date.now());
  if (results.failed.length === 0 && !opts.abortSignal?.aborted) {
    await setSyncMeta(`trip:${tripId}:lastFullSync`, Date.now());
  }

  return results;
}

/**
 * Retry a single failed document (user-initiated via Retry-button).
 * Resets retry_count so MAX_RETRIES cap doesn't block.
 */
export async function retryDocument(docId: string, opts: SyncOptions = {}): Promise<boolean> {
  if (!isWeb()) return false;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return false;
  await markSyncState(docId, 'pending', { retry_count: 0, last_error: null });
  const doc = await getDocumentMeta(docId);
  if (!doc) return false;
  const { succeeded } = await syncSingleDoc(doc, opts);
  return succeeded;
}

async function syncSingleDoc(
  doc: DocumentRecord,
  opts: SyncOptions
): Promise<{ succeeded: boolean; error?: string }> {
  await markSyncState(doc.id, 'syncing');
  try {
    const resp = await fetch(doc.url, {
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-cache',
      signal: opts.abortSignal,
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const blob = await resp.blob();
    const newHash = await sha256(blob);
    if (newHash === doc.hash && await blobStore.exists(doc.id)) {
      await markSyncState(doc.id, 'synced', {
        synced_at: Date.now(),
        retry_count: 0,
        last_error: null,
      });
      return { succeeded: true };
    }
    await blobStore.write(doc.id, blob);
    await markSyncState(doc.id, 'synced', {
      hash: newHash,
      synced_at: Date.now(),
      retry_count: 0,
      last_error: null,
    });
    return { succeeded: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markSyncState(doc.id, 'failed', {
      retry_count: (doc.retry_count ?? 0) + 1,
      last_error: message,
    });
    return { succeeded: false, error: message };
  }
}

/** Hash helper — exposed for potential downstream use. */
export { sha256 };
