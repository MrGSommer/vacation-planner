import { Platform } from 'react-native';
import { enqueue, registerOperation } from './offlineQueue';

interface OfflineMutationConfig<T> {
  operation: string;
  table: string;
  args: any[];
  cacheKeys: string[];
  fn: (...args: any[]) => Promise<T>;
  optimisticResult?: T;
}

export async function offlineMutation<T>(config: OfflineMutationConfig<T>): Promise<T> {
  const { operation, table, args, cacheKeys, fn, optimisticResult } = config;

  // Register the operation handler for replay
  registerOperation(operation, fn);

  // Online: execute directly
  if (Platform.OS !== 'web' || navigator.onLine) {
    return fn(...args);
  }

  // Offline: queue for later and return optimistic result
  enqueue({ operation, table, args, cacheKeys });

  if (optimisticResult !== undefined) {
    return optimisticResult;
  }

  // For void operations, return undefined as T
  return undefined as T;
}
