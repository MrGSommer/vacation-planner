import { Platform } from 'react-native';
import { supabase } from './supabase';
import {
  ALLOWED_PROPERTY_KEYS,
  EVENT_CATALOG,
  type EventName,
  type FunnelStats,
  type LiveSnapshot,
  type InsightsReport,
  type FableTopUser,
  type RateLimitViolation,
  type SuspendedUser,
  type SubscriptionStats,
} from '../types/analytics';

// ---------------- Session ID management ---------------------------------

let cachedSessionId: string | null = null;
const STORAGE_KEY = 'wf_session_id';

function randomUuid(): string {
  try {
    // @ts-ignore — crypto.randomUUID is available in modern browsers & RN 0.72+
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch {}
  return 'sid_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** Returns the stable analytics session id (localStorage on web, in-memory on native). */
export function getOrCreateSessionId(): string {
  if (cachedSessionId) return cachedSessionId;
  if (Platform.OS === 'web') {
    try {
      const existing = localStorage.getItem(STORAGE_KEY);
      if (existing) {
        cachedSessionId = existing;
        return existing;
      }
      const fresh = randomUuid();
      localStorage.setItem(STORAGE_KEY, fresh);
      cachedSessionId = fresh;
      return fresh;
    } catch {
      cachedSessionId = randomUuid();
      return cachedSessionId;
    }
  }
  cachedSessionId = randomUuid();
  return cachedSessionId;
}

/** Test hook — reset the cached session id (used on logout, not exposed in prod). */
export function resetSessionId(): void {
  cachedSessionId = null;
  if (Platform.OS === 'web') {
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  }
}

// ---------------- Metadata helpers --------------------------------------

function currentPath(): string | null {
  if (Platform.OS !== 'web') return null;
  try { return window?.location?.pathname ?? null; } catch { return null; }
}

function currentReferrer(): string | null {
  if (Platform.OS !== 'web') return null;
  try { return document?.referrer || null; } catch { return null; }
}

function currentUserAgent(): string | null {
  if (Platform.OS !== 'web') return null;
  try { return navigator?.userAgent || null; } catch { return null; }
}

function parseUtm(): { utm_source: string | null; utm_medium: string | null; utm_campaign: string | null } {
  if (Platform.OS !== 'web') return { utm_source: null, utm_medium: null, utm_campaign: null };
  try {
    const p = new URLSearchParams(window.location.search);
    return {
      utm_source: p.get('utm_source'),
      utm_medium: p.get('utm_medium'),
      utm_campaign: p.get('utm_campaign'),
    };
  } catch {
    return { utm_source: null, utm_medium: null, utm_campaign: null };
  }
}

function sanitizeProperties(props?: Record<string, unknown>): Record<string, unknown> {
  if (!props) return {};
  const clean: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(props)) {
    if (!ALLOWED_PROPERTY_KEYS.has(key)) continue;
    if (val == null) continue;
    if (typeof val === 'string' && val.length > 200) clean[key] = val.slice(0, 200);
    else clean[key] = val;
  }
  return clean;
}

// ---------------- Session-start dedup (30 min inactivity rule) ----------

const SESSION_TOUCH_KEY = 'wf_session_last_start';
const SESSION_WINDOW_MS = 30 * 60 * 1000;

/** Fire session_start at most once per 30 min of inactivity per tab. */
export function trackSessionStartIfNeeded(): void {
  if (Platform.OS === 'web') {
    try {
      const last = Number(sessionStorage.getItem(SESSION_TOUCH_KEY) || '0');
      const now = Date.now();
      if (last && now - last < SESSION_WINDOW_MS) return;
      sessionStorage.setItem(SESSION_TOUCH_KEY, String(now));
    } catch {}
  }
  trackEvent('session_start');
}

// ---------------- Public API --------------------------------------------

/** Fire-and-forget event tracking. Never throws, never awaits. */
export function trackEvent(name: EventName, properties?: Record<string, unknown>): void {
  const category = EVENT_CATALOG[name];
  if (!category) return;
  const sessionId = getOrCreateSessionId();
  const utm = parseUtm();

  supabase
    .rpc('log_analytics_event', {
      p_session_id: sessionId,
      p_event_name: name,
      p_category: category,
      p_properties: sanitizeProperties(properties),
      p_path: currentPath(),
      p_user_id: null,
      p_referrer: currentReferrer(),
      p_user_agent: currentUserAgent(),
      p_platform: Platform.OS,
      p_utm_source: utm.utm_source,
      p_utm_medium: utm.utm_medium,
      p_utm_campaign: utm.utm_campaign,
    })
    .then(() => {})
    .catch(() => {});
}

/** Link current anonymous session to a user after signup/login. */
export async function ensureSessionLinked(userId: string | null | undefined): Promise<void> {
  if (!userId) return;
  try {
    await supabase.rpc('link_session_to_user', {
      p_session_id: getOrCreateSessionId(),
      p_user_id: userId,
    });
  } catch {
    // non-critical
  }
}

// ---------------- Admin fetchers ---------------------------------------

export async function adminGetLiveSnapshot(): Promise<LiveSnapshot> {
  const { data, error } = await supabase.rpc('admin_get_live_snapshot');
  if (error) throw error;
  return data as LiveSnapshot;
}

export async function adminGetFunnelStats(from?: Date, to?: Date): Promise<FunnelStats> {
  const { data, error } = await supabase.rpc('admin_get_funnel_stats', {
    p_from: from ? from.toISOString() : null,
    p_to: to ? to.toISOString() : null,
  });
  if (error) throw error;
  return data as FunnelStats;
}

export async function adminListInsightsReports(limit = 10): Promise<InsightsReport[]> {
  const { data, error } = await supabase
    .from('insights_reports')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []) as InsightsReport[];
}

export async function adminGenerateInsightsReport(params: {
  focus?: 'full' | 'funnel' | 'retention' | 'monetization' | 'engagement';
  period_start?: string; // YYYY-MM-DD
  period_end?: string;
}): Promise<InsightsReport> {
  const { data, error } = await supabase.functions.invoke('ai-insights-report', {
    body: {
      focus: params.focus || 'full',
      period_start: params.period_start,
      period_end: params.period_end,
      triggered_by: 'on_demand',
    },
  });
  if (error) throw error;
  return data as InsightsReport;
}

// ---------------- Subscription stats (DB-only, fast) -------------------

export async function adminGetSubscriptionStats(): Promise<SubscriptionStats> {
  const { data, error } = await supabase.rpc('admin_get_subscription_stats');
  if (error) throw error;
  return data as SubscriptionStats;
}

// ---------------- Fable abuse / suspension admin ------------------------

export async function adminGetFableTopUsers(days = 7): Promise<FableTopUser[]> {
  const { data, error } = await supabase.rpc('admin_get_fable_top_users', { p_days: days });
  if (error) throw error;
  return (data || []) as FableTopUser[];
}

export async function adminGetRecentViolations(hours = 24): Promise<RateLimitViolation[]> {
  const { data, error } = await supabase.rpc('admin_get_recent_violations', { p_hours: hours });
  if (error) throw error;
  return (data || []) as RateLimitViolation[];
}

export async function adminGetSuspendedUsers(): Promise<SuspendedUser[]> {
  const { data, error } = await supabase.rpc('admin_get_suspended_users');
  if (error) throw error;
  return (data || []) as SuspendedUser[];
}

export async function adminSetFableSuspension(
  userId: string,
  suspendedUntil: Date | null,
  reason?: string,
): Promise<void> {
  const { error } = await supabase.rpc('admin_set_fable_suspension', {
    p_user_id: userId,
    p_suspended_until: suspendedUntil ? suspendedUntil.toISOString() : null,
    p_reason: reason ?? null,
  });
  if (error) throw error;
}
