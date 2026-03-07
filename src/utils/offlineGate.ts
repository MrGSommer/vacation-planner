import { Platform } from 'react-native';

let _showToast: ((message: string, type?: 'info' | 'success' | 'error' | 'warning', duration?: number) => void) | null = null;

export function setOfflineGateToast(showToast: typeof _showToast): void {
  _showToast = showToast;
}

export function requireOnline(featureName: string): boolean {
  if (Platform.OS !== 'web' || navigator.onLine) return true;

  if (_showToast) {
    _showToast(`${featureName} ist nur mit Internetverbindung verfuegbar`, 'info');
  }
  return false;
}
