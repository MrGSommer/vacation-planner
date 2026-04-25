import Dexie, { Table } from 'dexie';
import { Platform } from 'react-native';

/**
 * Document metadata + sync-state store (separate from blob storage).
 *
 * Schema:
 *   documents — one row per ActivityDocument, tracks sync lifecycle per doc.
 *   syncMeta  — key/value for trip-level timestamps (lastFullSync, lastAttempt).
 *
 * Blob bytes live in blobStore (OPFS or IDB `wayfable-blobs` DB).
 * The document.id field matches blobStore's id, so the two stores stay in sync.
 */

export type SyncState = 'pending' | 'syncing' | 'synced' | 'stale' | 'failed';

export interface DocumentRecord {
  id: string;
  trip_id: string;
  activity_id: string;
  url: string;
  filename: string;
  mime_type: string;
  server_updated_at: number;   // ms since epoch; from activity_documents.created_at/updated_at
  synced_at: number | null;    // when blob was successfully written locally
  hash: string | null;          // SHA-256 of last synced blob
  sync_state: SyncState;
  priority: number;             // lower = sync earlier (0 = highest priority)
  retry_count: number;
  last_error: string | null;
}

export interface SyncMetaRecord {
  key: string;                  // e.g. `trip:${tripId}:lastFullSync`
  value: number | string;
}

class WayfableMetaDB extends Dexie {
  documents!: Table<DocumentRecord, string>;
  syncMeta!: Table<SyncMetaRecord, string>;

  constructor() {
    super('wayfable-meta');
    this.version(1).stores({
      documents: 'id, trip_id, sync_state, priority, [trip_id+sync_state]',
      syncMeta: 'key',
    });
  }
}

function isWeb(): boolean {
  return Platform.OS === 'web';
}

let _db: WayfableMetaDB | null = null;
function db(): WayfableMetaDB {
  if (!_db) _db = new WayfableMetaDB();
  return _db;
}

// ─── CRUD ────────────────────────────────────────────────────────────────

/**
 * Upsert metadata for a document. Preserves sync-state fields (hash, synced_at,
 * retry_count) if they already exist. If server_updated_at is newer than the
 * stored synced_at, marks the doc as 'stale' so the next sync picks it up.
 */
export async function upsertDocumentMeta(
  input: Omit<DocumentRecord, 'sync_state' | 'synced_at' | 'hash' | 'retry_count' | 'last_error'>
): Promise<DocumentRecord> {
  if (!isWeb()) throw new Error('documentStore is web-only');
  const existing = await db().documents.get(input.id);

  if (!existing) {
    const record: DocumentRecord = {
      ...input,
      synced_at: null,
      hash: null,
      sync_state: 'pending',
      retry_count: 0,
      last_error: null,
    };
    await db().documents.put(record);
    return record;
  }

  // Preserve sync-state but refresh mutable metadata (url, filename, priority, server_updated_at)
  const serverNewer = input.server_updated_at > (existing.synced_at ?? 0);
  const nextState: SyncState = serverNewer && existing.sync_state === 'synced'
    ? 'stale'
    : existing.sync_state;

  const merged: DocumentRecord = {
    ...existing,
    url: input.url,
    filename: input.filename,
    mime_type: input.mime_type,
    priority: input.priority,
    server_updated_at: input.server_updated_at,
    sync_state: nextState,
  };
  await db().documents.put(merged);
  return merged;
}

/**
 * Returns documents for a trip that need syncing (not synced, or server newer).
 * Sorted: unsynced → failed → stale → then by priority ascending.
 */
export async function getDocumentsToSync(tripId: string): Promise<DocumentRecord[]> {
  if (!isWeb()) return [];
  const all = await db().documents.where('trip_id').equals(tripId).toArray();
  return all.filter(d => d.sync_state !== 'synced' || d.server_updated_at > (d.synced_at ?? 0));
}

/** All documents for a trip, regardless of state. */
export async function getTripDocuments(tripId: string): Promise<DocumentRecord[]> {
  if (!isWeb()) return [];
  return db().documents.where('trip_id').equals(tripId).toArray();
}

/** Lookup by id (used by openDocument for url → docId indirection). */
export async function getDocumentMeta(docId: string): Promise<DocumentRecord | undefined> {
  if (!isWeb()) return undefined;
  return db().documents.get(docId);
}

/** State-machine transition. Patch is merged into the record. */
export async function markSyncState(
  docId: string,
  state: SyncState,
  patch: Partial<DocumentRecord> = {}
): Promise<void> {
  if (!isWeb()) return;
  const existing = await db().documents.get(docId);
  if (!existing) return;
  await db().documents.put({ ...existing, ...patch, sync_state: state });
}

/** Delete all metadata for a trip (used on trip toggle-OFF). */
export async function deleteTripDocuments(tripId: string): Promise<string[]> {
  if (!isWeb()) return [];
  const docs = await db().documents.where('trip_id').equals(tripId).toArray();
  const ids = docs.map(d => d.id);
  await db().documents.bulkDelete(ids);
  return ids;
}

/** Delete metadata for a single document. */
export async function deleteDocumentMeta(docId: string): Promise<void> {
  if (!isWeb()) return;
  await db().documents.delete(docId);
}

/** Nuke all metadata (used on logout). */
export async function clearAllDocuments(): Promise<void> {
  if (!isWeb()) return;
  await db().documents.clear();
  await db().syncMeta.clear();
}

// ─── syncMeta helpers ────────────────────────────────────────────────────

export async function setSyncMeta(key: string, value: number | string): Promise<void> {
  if (!isWeb()) return;
  await db().syncMeta.put({ key, value });
}

export async function getSyncMeta(key: string): Promise<number | string | undefined> {
  if (!isWeb()) return undefined;
  const row = await db().syncMeta.get(key);
  return row?.value;
}
