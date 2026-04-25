import Dexie, { Table } from 'dexie';
import { Platform } from 'react-native';

/**
 * Blob storage abstraction: primary OPFS, fallback IndexedDB.
 *
 * OPFS (Origin Private File System) is preferred because:
 * - 3-4x faster than IDB blob storage
 * - Better iOS Safari 17+ stability against eviction
 * - Native file-based API (streams, createWritable)
 *
 * IDB fallback kicks in on browsers without OPFS support (pre-Safari 17).
 *
 * ID scheme: opaque string (typically ActivityDocument.id). OPFS uses a safe
 * filename derived from the id (only [A-Za-z0-9_-]) to avoid filesystem issues.
 */

interface BlobStore {
  write(id: string, blob: Blob): Promise<void>;
  read(id: string): Promise<Blob | null>;
  delete(id: string): Promise<void>;
  exists(id: string): Promise<boolean>;
  clearAll(): Promise<void>;
  backend(): 'opfs' | 'idb' | 'none';
}

const BLOB_DIR = 'wayfable-blobs';

function isWeb(): boolean {
  return Platform.OS === 'web';
}

function hasOPFS(): boolean {
  return isWeb() && typeof navigator !== 'undefined'
    && typeof navigator.storage?.getDirectory === 'function';
}

// Safe filename: strip anything that isn't a-zA-Z0-9_-
function safeName(id: string): string {
  return id.replace(/[^A-Za-z0-9_-]/g, '_');
}

// ─── OPFS Implementation ──────────────────────────────────────────────────

class OPFSBlobStore implements BlobStore {
  private dirHandle: FileSystemDirectoryHandle | null = null;
  private dirPromise: Promise<FileSystemDirectoryHandle> | null = null;

  private async getDir(): Promise<FileSystemDirectoryHandle> {
    if (this.dirHandle) return this.dirHandle;
    if (!this.dirPromise) {
      this.dirPromise = (async () => {
        const root = await navigator.storage.getDirectory();
        const dir = await root.getDirectoryHandle(BLOB_DIR, { create: true });
        this.dirHandle = dir;
        return dir;
      })();
    }
    return this.dirPromise;
  }

  async write(id: string, blob: Blob): Promise<void> {
    const dir = await this.getDir();
    const file = await dir.getFileHandle(safeName(id), { create: true });
    // @ts-ignore — createWritable available in modern browsers
    const writable = await file.createWritable();
    try {
      await writable.write(blob);
    } finally {
      await writable.close();
    }
  }

  async read(id: string): Promise<Blob | null> {
    try {
      const dir = await this.getDir();
      const file = await dir.getFileHandle(safeName(id));
      const fileObj = await file.getFile();
      // Return as Blob (File extends Blob) — no copy needed
      return fileObj;
    } catch {
      return null; // NotFoundError
    }
  }

  async delete(id: string): Promise<void> {
    try {
      const dir = await this.getDir();
      // @ts-ignore — removeEntry available in modern browsers
      await dir.removeEntry(safeName(id));
    } catch {
      // Already gone — silent
    }
  }

  async exists(id: string): Promise<boolean> {
    try {
      const dir = await this.getDir();
      await dir.getFileHandle(safeName(id));
      return true;
    } catch {
      return false;
    }
  }

  async clearAll(): Promise<void> {
    try {
      const root = await navigator.storage.getDirectory();
      // @ts-ignore — removeEntry recursive option
      await root.removeEntry(BLOB_DIR, { recursive: true });
      this.dirHandle = null;
      this.dirPromise = null;
    } catch {
      // Directory doesn't exist — silent
    }
  }

  backend() { return 'opfs' as const; }
}

// ─── IDB Fallback (Dexie) ─────────────────────────────────────────────────

interface BlobRow {
  id: string;
  blob: Blob;
}

class IDBBlobDB extends Dexie {
  blobs!: Table<BlobRow, string>;

  constructor() {
    super('wayfable-blobs');
    this.version(1).stores({
      blobs: 'id',
    });
  }
}

class IDBBlobStore implements BlobStore {
  private db: IDBBlobDB | null = null;

  private getDB(): IDBBlobDB {
    if (!this.db) this.db = new IDBBlobDB();
    return this.db;
  }

  async write(id: string, blob: Blob): Promise<void> {
    await this.getDB().blobs.put({ id, blob });
  }

  async read(id: string): Promise<Blob | null> {
    const row = await this.getDB().blobs.get(id);
    return row?.blob ?? null;
  }

  async delete(id: string): Promise<void> {
    await this.getDB().blobs.delete(id);
  }

  async exists(id: string): Promise<boolean> {
    const count = await this.getDB().blobs.where('id').equals(id).count();
    return count > 0;
  }

  async clearAll(): Promise<void> {
    try {
      await this.getDB().blobs.clear();
    } catch {
      // Silent
    }
  }

  backend() { return 'idb' as const; }
}

// ─── No-op (native platforms) ─────────────────────────────────────────────

class NoopBlobStore implements BlobStore {
  async write(): Promise<void> {}
  async read(): Promise<Blob | null> { return null; }
  async delete(): Promise<void> {}
  async exists(): Promise<boolean> { return false; }
  async clearAll(): Promise<void> {}
  backend() { return 'none' as const; }
}

// ─── Singleton Selector ───────────────────────────────────────────────────

function createBlobStore(): BlobStore {
  if (!isWeb()) return new NoopBlobStore();
  if (hasOPFS()) return new OPFSBlobStore();
  return new IDBBlobStore();
}

export const blobStore: BlobStore = createBlobStore();
