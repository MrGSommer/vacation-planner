import { useEffect, useState, useCallback, useRef } from 'react';
import { Platform } from 'react-native';

export function useServiceWorkerUpdate() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const waitingWorkerRef = useRef<ServiceWorker | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web' || !('serviceWorker' in navigator)) return;

    let registration: ServiceWorkerRegistration | null = null;

    const trackInstalling = (sw: ServiceWorker) => {
      sw.addEventListener('statechange', () => {
        if (sw.state === 'installed' && navigator.serviceWorker.controller) {
          // New SW installed while an existing one controls the page = update ready
          waitingWorkerRef.current = sw;
          setUpdateAvailable(true);
        }
      });
    };

    navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then((reg) => {
        registration = reg;

        // If there's already a waiting worker (e.g. from a previous visit)
        if (reg.waiting && navigator.serviceWorker.controller) {
          waitingWorkerRef.current = reg.waiting;
          setUpdateAvailable(true);
        }

        // Listen for new updates
        reg.addEventListener('updatefound', () => {
          const newSW = reg.installing;
          if (newSW) trackInstalling(newSW);
        });

        // Check for updates periodically (every 60s)
        const interval = setInterval(() => {
          reg.update().catch(() => {});
        }, 60_000);

        // iOS PWA: check immediately on visibility change (app foregrounded)
        const onVisibility = () => {
          if (document.visibilityState === 'visible') {
            reg.update().catch(() => {});
          }
        };
        document.addEventListener('visibilitychange', onVisibility);

        return () => {
          clearInterval(interval);
          document.removeEventListener('visibilitychange', onVisibility);
        };
      })
      .catch((err) => {
        console.warn('SW registration failed:', err);
      });

    // When the new SW takes over, reload the page
    let refreshing = false;
    const onControllerChange = () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);

  // Fallback: version.json polling (catches updates even when SW lifecycle events fail,
  // e.g. iOS PWA standalone mode where controllerchange is unreliable)
  useEffect(() => {
    if (Platform.OS !== 'web') return;

    let knownVersion: string | null = null;
    let refreshing = false;

    const checkVersion = async () => {
      try {
        const res = await fetch('/version.json', { cache: 'no-store' });
        if (!res.ok) return;
        const { v } = await res.json();
        if (!v) return;
        if (knownVersion === null) {
          // First load — store the current version
          knownVersion = v;
        } else if (v !== knownVersion && !refreshing) {
          refreshing = true;
          window.location.reload();
        }
      } catch {
        // Offline or version.json not yet deployed — ignore
      }
    };

    // Check on mount
    checkVersion();

    // Check every 2 minutes
    const interval = setInterval(checkVersion, 120_000);

    // Check on visibility change (app foregrounded after being in background)
    const onVisibility = () => {
      if (document.visibilityState === 'visible') checkVersion();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const applyUpdate = useCallback(() => {
    const waiting = waitingWorkerRef.current;
    if (waiting) {
      waiting.postMessage({ type: 'SKIP_WAITING' });
    }
  }, []);

  return { updateAvailable, applyUpdate };
}
