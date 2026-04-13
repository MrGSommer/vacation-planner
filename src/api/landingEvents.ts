import { supabase } from './supabase';
import { Platform } from 'react-native';

type LandingEventType = 'page_view' | 'plan_generated' | 'signup_click' | 'registered' | 'waitlisted';

// Stable session ID per browser tab (survives navigation within SPA)
let sessionId: string | null = null;
function getSessionId(): string {
  if (sessionId) return sessionId;
  if (Platform.OS === 'web') {
    try {
      sessionId = sessionStorage.getItem('wf_session_id');
      if (!sessionId) {
        sessionId = crypto.randomUUID();
        sessionStorage.setItem('wf_session_id', sessionId);
      }
    } catch {
      sessionId = crypto.randomUUID();
    }
  } else {
    sessionId = crypto.randomUUID();
  }
  return sessionId;
}

/** Fire-and-forget landing event tracking */
export function trackLandingEvent(eventType: LandingEventType, query?: string): void {
  const referrer = Platform.OS === 'web' ? (document?.referrer || null) : null;
  const userAgent = Platform.OS === 'web' ? (navigator?.userAgent || null) : null;

  supabase
    .from('landing_events')
    .insert({
      event_type: eventType,
      session_id: getSessionId(),
      query: query || null,
      referrer,
      user_agent: userAgent,
    })
    .then(() => {})
    .catch(() => {});
}

/** Admin: get landing funnel stats */
export async function adminGetLandingStats(): Promise<{
  page_views_today: number;
  page_views_7d: number;
  page_views_30d: number;
  plans_generated_today: number;
  plans_generated_7d: number;
  plans_generated_30d: number;
  signup_clicks_today: number;
  signup_clicks_7d: number;
  signup_clicks_30d: number;
  conversions_today: number;
  conversions_7d: number;
  conversions_30d: number;
  conversion_rate_7d: number;
  top_queries: { query: string; count: number }[];
}> {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const d7 = new Date(now.getTime() - 7 * 86400000).toISOString();
  const d30 = new Date(now.getTime() - 30 * 86400000).toISOString();

  const { data, error } = await supabase
    .from('landing_events')
    .select('event_type, query, created_at')
    .gte('created_at', d30)
    .order('created_at', { ascending: false });

  if (error) throw error;
  const events = data || [];

  const count = (type: string, since: string) =>
    events.filter(e => e.event_type === type && e.created_at >= since).length;

  const pvToday = count('page_view', todayStart);
  const pv7 = count('page_view', d7);
  const pv30 = count('page_view', d30);
  const pgToday = count('plan_generated', todayStart);
  const pg7 = count('plan_generated', d7);
  const pg30 = count('plan_generated', d30);
  const scToday = count('signup_click', todayStart);
  const sc7 = count('signup_click', d7);
  const sc30 = count('signup_click', d30);
  const convToday = events.filter(e => (e.event_type === 'registered' || e.event_type === 'waitlisted') && e.created_at >= todayStart).length;
  const conv7 = events.filter(e => (e.event_type === 'registered' || e.event_type === 'waitlisted') && e.created_at >= d7).length;
  const conv30 = events.filter(e => (e.event_type === 'registered' || e.event_type === 'waitlisted') && e.created_at >= d30).length;

  // Top queries
  const queryCounts: Record<string, number> = {};
  events.filter(e => e.event_type === 'plan_generated' && e.query).forEach(e => {
    const q = (e.query as string).toLowerCase().trim();
    queryCounts[q] = (queryCounts[q] || 0) + 1;
  });
  const topQueries = Object.entries(queryCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([query, count]) => ({ query, count }));

  return {
    page_views_today: pvToday, page_views_7d: pv7, page_views_30d: pv30,
    plans_generated_today: pgToday, plans_generated_7d: pg7, plans_generated_30d: pg30,
    signup_clicks_today: scToday, signup_clicks_7d: sc7, signup_clicks_30d: sc30,
    conversions_today: convToday, conversions_7d: conv7, conversions_30d: conv30,
    conversion_rate_7d: pv7 > 0 ? Math.round((conv7 / pv7) * 100) : 0,
    top_queries: topQueries,
  };
}
