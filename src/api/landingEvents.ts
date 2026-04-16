import { supabase } from './supabase';
import { trackEvent } from './analytics';

type LandingEventType = 'page_view' | 'plan_generated' | 'signup_click' | 'registered' | 'waitlisted';

// Compatibility shim — forwards to the new analytics pipeline so existing
// call sites keep working while we migrate the catalog.
export function trackLandingEvent(eventType: LandingEventType, query?: string): void {
  switch (eventType) {
    case 'page_view':
      trackEvent('landing_page_view');
      break;
    case 'plan_generated':
      trackEvent('landing_plan_generated', query ? { query: query.slice(0, 100) } : undefined);
      break;
    case 'signup_click':
      trackEvent('landing_signup_click');
      break;
    case 'registered':
      trackEvent('signup_completed');
      break;
    case 'waitlisted':
      trackEvent('landing_waitlist_joined');
      break;
  }
}

/** Admin: landing funnel stats (backwards compat for BetaDashboardScreen).
 *  Reads from the unified analytics_events table — legacy rows were backfilled. */
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
    .from('analytics_events')
    .select('event_name, properties, created_at')
    .gte('created_at', d30)
    .in('event_name', ['landing_page_view','landing_plan_generated','landing_signup_click','signup_completed','landing_waitlist_joined'])
    .order('created_at', { ascending: false });

  if (error) throw error;
  const events = data || [];

  const count = (name: string, since: string) =>
    events.filter(e => e.event_name === name && e.created_at >= since).length;

  const pvToday = count('landing_page_view', todayStart);
  const pv7 = count('landing_page_view', d7);
  const pv30 = count('landing_page_view', d30);
  const pgToday = count('landing_plan_generated', todayStart);
  const pg7 = count('landing_plan_generated', d7);
  const pg30 = count('landing_plan_generated', d30);
  const scToday = count('landing_signup_click', todayStart);
  const sc7 = count('landing_signup_click', d7);
  const sc30 = count('landing_signup_click', d30);
  const isConv = (n: string) => n === 'signup_completed' || n === 'landing_waitlist_joined';
  const convToday = events.filter(e => isConv(e.event_name) && e.created_at >= todayStart).length;
  const conv7 = events.filter(e => isConv(e.event_name) && e.created_at >= d7).length;
  const conv30 = events.filter(e => isConv(e.event_name) && e.created_at >= d30).length;

  const queryCounts: Record<string, number> = {};
  events.filter(e => e.event_name === 'landing_plan_generated' && e.properties && (e.properties as any).query).forEach(e => {
    const q = String((e.properties as any).query).toLowerCase().trim();
    if (!q) return;
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
