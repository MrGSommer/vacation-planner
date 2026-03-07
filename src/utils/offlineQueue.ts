import { Platform } from 'react-native';

const STORAGE_KEY = 'wayfable_offline_queue';

export interface QueuedMutation {
  id: string;
  timestamp: number;
  operation: string;
  table: string;
  args: any[];
  cacheKeys: string[];
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function enqueue(mutation: Omit<QueuedMutation, 'id' | 'timestamp'>): void {
  if (Platform.OS !== 'web') return;
  const queue = getQueue();
  queue.push({ ...mutation, id: generateId(), timestamp: Date.now() });
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {}
}

export function getQueue(): QueuedMutation[] {
  if (Platform.OS !== 'web') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function clearQueue(): void {
  if (Platform.OS !== 'web') return;
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

export function removeFromQueue(id: string): void {
  if (Platform.OS !== 'web') return;
  const queue = getQueue().filter(m => m.id !== id);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {}
}

// Registry of operation handlers — populated by offlineMutation.ts
const operationRegistry: Record<string, (...args: any[]) => Promise<any>> = {};

export function registerOperation(name: string, fn: (...args: any[]) => Promise<any>): void {
  operationRegistry[name] = fn;
}

export async function replayQueue(): Promise<{ succeeded: number; failed: QueuedMutation[] }> {
  const { invalidateCache } = await import('./queryCache');
  const queue = getQueue();
  if (queue.length === 0) return { succeeded: 0, failed: [] };

  let succeeded = 0;
  const failed: QueuedMutation[] = [];
  const keysToInvalidate = new Set<string>();

  for (const mutation of queue) {
    const handler = operationRegistry[mutation.operation];
    if (!handler) {
      failed.push(mutation);
      continue;
    }
    try {
      await handler(...mutation.args);
      removeFromQueue(mutation.id);
      succeeded++;
      mutation.cacheKeys.forEach(k => keysToInvalidate.add(k));
    } catch {
      failed.push(mutation);
    }
  }

  // Invalidate all affected caches
  keysToInvalidate.forEach(key => invalidateCache(key));

  return { succeeded, failed };
}
