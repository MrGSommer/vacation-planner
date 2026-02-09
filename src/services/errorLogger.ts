import { supabase } from '../api/supabase';
import { Platform, Dimensions } from 'react-native';
import appJson from '../../app.json';

type Severity = 'critical' | 'error' | 'warning';

interface LogOptions {
  severity?: Severity;
  component: string;
  errorCode?: string;
  context?: Record<string, any>;
}

const MAX_MESSAGE_LENGTH = 500;
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;
const timestamps: number[] = [];

function truncate(msg: string, max: number): string {
  return msg.length > max ? msg.slice(0, max) + '...' : msg;
}

function getDeviceInfo(): string {
  const { width, height } = Dimensions.get('window');
  let info = `${Platform.OS} ${width}x${height}`;
  if (Platform.OS === 'web' && typeof navigator !== 'undefined') {
    info += ` ${navigator.userAgent.split(' ').slice(-2).join(' ')}`;
  }
  return info;
}

function isRateLimited(): boolean {
  const now = Date.now();
  // Remove timestamps outside the window
  while (timestamps.length > 0 && timestamps[0] < now - RATE_WINDOW_MS) {
    timestamps.shift();
  }
  if (timestamps.length >= RATE_LIMIT) return true;
  timestamps.push(now);
  return false;
}

export function logError(
  error: unknown,
  { severity = 'error', component, errorCode, context }: LogOptions,
): void {
  try {
    if (isRateLimited()) return;

    const message = error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : JSON.stringify(error);

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from('app_error_logs').insert({
        user_id: user.id,
        severity,
        error_message: truncate(message, MAX_MESSAGE_LENGTH),
        error_code: errorCode || null,
        component,
        context: context || {},
        device_info: getDeviceInfo(),
        app_version: appJson.expo.version,
      }).then(() => {
        // fire-and-forget
      });
    });
  } catch {
    // Logger must never throw
  }
}

export function logCritical(error: unknown, options: Omit<LogOptions, 'severity'>): void {
  logError(error, { ...options, severity: 'critical' });
}

export function logWarning(error: unknown, options: Omit<LogOptions, 'severity'>): void {
  logError(error, { ...options, severity: 'warning' });
}
