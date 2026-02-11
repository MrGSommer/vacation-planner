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

  const applyUpdate = useCallback(() => {
    const waiting = waitingWorkerRef.current;
    if (waiting) {
      waiting.postMessage({ type: 'SKIP_WAITING' });
    }
  }, []);

  return { updateAvailable, applyUpdate };
}
