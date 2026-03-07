import { useState, useEffect, useCallback, useRef } from 'react';
import { Platform } from 'react-native';
import { getQueue, replayQueue } from '../utils/offlineQueue';
import { useToast } from '../contexts/ToastContext';

export function useOfflineSync(): { pendingCount: number; syncing: boolean } {
  const [pendingCount, setPendingCount] = useState(() => getQueue().length);
  const [syncing, setSyncing] = useState(false);
  const { showToast } = useToast();
  const syncingRef = useRef(false);

  const refreshCount = useCallback(() => {
    setPendingCount(getQueue().length);
  }, []);

  const doSync = useCallback(async () => {
    if (syncingRef.current) return;
    const queue = getQueue();
    if (queue.length === 0) return;

    syncingRef.current = true;
    setSyncing(true);

    try {
      const { succeeded, failed } = await replayQueue();
      if (succeeded > 0) {
        showToast(`${succeeded} Aenderung${succeeded > 1 ? 'en' : ''} synchronisiert`, 'success');
      }
      if (failed.length > 0) {
        showToast(`${failed.length} Aenderung${failed.length > 1 ? 'en' : ''} fehlgeschlagen`, 'error');
      }
    } finally {
      syncingRef.current = false;
      setSyncing(false);
      refreshCount();
    }
  }, [showToast, refreshCount]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const onOnline = () => {
      doSync();
    };

    window.addEventListener('online', onOnline);

    // Poll queue count periodically (for UI updates when items are enqueued)
    const interval = setInterval(refreshCount, 2000);

    return () => {
      window.removeEventListener('online', onOnline);
      clearInterval(interval);
    };
  }, [doSync, refreshCount]);

  return { pendingCount, syncing };
}
