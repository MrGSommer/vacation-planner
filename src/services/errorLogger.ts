import { supabase } from '../api/supabase';
import { Platform, Dimensions } from 'react-native';
import appJson from '../../app.json';
import { BUILD_NUMBER } from '../utils/buildInfo';

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

// Network/connectivity errors are not application bugs — skip logging them
const NETWORK_ERROR_PATTERNS = [
  'failed to fetch',
  'load failed',
  'networkerror',
  'network request failed',
  'net::err_',
  'the internet connection appears to be offline',
  'the network connection was lost',
  'a server with the specified hostname could not be found',
  'the operation couldn\'t be completed',
  'aborted',
];

function isNetworkError(message: string): boolean {
  const lower = message.toLowerCase();
  return NETWORK_ERROR_PATTERNS.some(p => lower.includes(p));
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

    // Skip network/connectivity errors — these are not application bugs
    if (isNetworkError(message)) return;

    const stack = error instanceof Error && error.stack
      ? error.stack.split('\n').slice(0, 5).join('\n')
      : undefined;

    const enrichedContext = {
      ...context,
      ...(stack ? { stack } : {}),
    };

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from('app_error_logs').insert({
        user_id: user.id,
        severity,
        error_message: truncate(message, MAX_MESSAGE_LENGTH),
        error_code: errorCode || null,
        component,
        context: enrichedContext,
        device_info: getDeviceInfo(),
        app_version: `${appJson.expo.version}+${BUILD_NUMBER}`,
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
