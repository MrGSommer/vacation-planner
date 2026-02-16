import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import { useServiceWorkerUpdate } from '../../hooks/useServiceWorkerUpdate';

/**
 * Invisible auto-update component.
 *
 * With self.skipWaiting() in the SW install handler, updates activate immediately
 * and the controllerchange listener in useServiceWorkerUpdate reloads the page.
 *
 * This component acts as a fallback: if the SW update is detected but the
 * automatic skipWaiting + reload didn't fire, it sends SKIP_WAITING after a
 * short delay to ensure the update applies.
 *
 * Auth state (localStorage) survives the reload — users stay logged in.
 */
export const UpdateBanner: React.FC = () => {
  const { updateAvailable, applyUpdate } = useServiceWorkerUpdate();

  useEffect(() => {
    if (!updateAvailable) return;

    // Short delay to avoid interrupting active interactions, then force the update
    const timer = setTimeout(() => {
      applyUpdate();
    }, 1500);

    return () => clearTimeout(timer);
  }, [updateAvailable, applyUpdate]);

  // No visible UI — updates are fully automatic
  if (Platform.OS !== 'web') return null;
  return null;
};
