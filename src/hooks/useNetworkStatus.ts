import { useState, useEffect } from 'react';
import { Platform } from 'react-native';

export function useNetworkStatus(): boolean {
  const [isOnline, setIsOnline] = useState(() => {
    if (Platform.OS === 'web') {
      return navigator.onLine;
    }
    return true;
  });

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);

    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return isOnline;
}
