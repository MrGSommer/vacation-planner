// Analytics event catalog + table types.
// Keep the union and EVENT_CATALOG in sync — trackEvent() looks up the
// category automatically so callers don't have to pass it.

export type EventCategory = 'landing' | 'auth' | 'activation' | 'monetization' | 'retention' | 'system';

export type EventName =
  // landing
  | 'landing_page_view'
  | 'landing_plan_generated'
  | 'landing_signup_click'
  | 'landing_waitlist_joined'
  // auth
  | 'signup_started'
  | 'signup_completed'
  | 'email_confirmed'
  | 'login_succeeded'
  // activation
  | 'first_trip_created'
  | 'first_stop_added'
  | 'first_activity_added'
  | 'first_fable_use'
  | 'first_plan_generated'
  // monetization
  | 'paywall_shown'
  | 'paywall_dismissed'
  | 'checkout_started'
  | 'subscription_purchased'
  | 'subscription_cancelled'
  | 'inspirations_purchased'
  // retention
  | 'session_start'
  | 'trip_completed'
  | 'rueckblick_viewed';

export const EVENT_CATALOG: Record<EventName, EventCategory> = {
  landing_page_view: 'landing',
  landing_plan_generated: 'landing',
  landing_signup_click: 'landing',
  landing_waitlist_joined: 'landing',

  signup_started: 'auth',
  signup_completed: 'auth',
  email_confirmed: 'auth',
  login_succeeded: 'auth',

  first_trip_created: 'activation',
  first_stop_added: 'activation',
  first_activity_added: 'activation',
  first_fable_use: 'activation',
  first_plan_generated: 'activation',

  paywall_shown: 'monetization',
  paywall_dismissed: 'monetization',
  checkout_started: 'monetization',
  subscription_purchased: 'monetization',
  subscription_cancelled: 'monetization',
  inspirations_purchased: 'monetization',

  session_start: 'retention',
  trip_completed: 'retention',
  rueckblick_viewed: 'retention',
};

// Whitelist of property keys the client is allowed to send (no PII).
// Anything outside this list gets stripped in trackEvent().
export const ALLOWED_PROPERTY_KEYS = new Set<string>([
  'trigger',           // paywall trigger: second_trip_attempt, photo_limit_reached, ...
  'query',             // anonymized search query for landing_plan_generated
  'tier',              // free | premium | free_with_credits
  'days',              // trip duration
  'has_credits',       // boolean
  'credit_cost',       // numeric
  'plan_source',       // 'landing' | 'app'
  'referrer_source',   // waitlist referrer
  'feature',           // feature name for paywall
  'trip_id_hash',      // hashed trip id (non-PII correlation)
  'task_type',         // fable task type
  'amount_chf',        // monetization amount
  'price_id',          // stripe price id
]);

// DB row types --------------------------------------------------------------

export interface AnalyticsSession {
  id: string;
  session_id: string;
  user_id: string | null;
  first_seen_at: string;
  last_seen_at: string;
  first_path: string | null;
  referrer: string | null;
  user_agent: string | null;
  platform: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  events_count: number;
}

export interface AnalyticsEvent {
  id: string;
  session_id: string;
  user_id: string | null;
  event_name: string;
  event_category: EventCategory;
  properties: Record<string, unknown>;
  path: string | null;
  created_at: string;
}

export interface InsightsReport {
  id: string;
  period_start: string;
  period_end: string;
  report_type: 'weekly' | 'on_demand';
  focus: 'full' | 'funnel' | 'retention' | 'monetization' | 'engagement';
  metrics: Record<string, unknown>;
  summary: string | null;
  findings: Array<{
    severity: 'info' | 'warning' | 'critical';
    title: string;
    description: string;
    evidence?: string;
    data_sufficient?: boolean;
  }>;
  actions: Array<{
    size: 'S' | 'M' | 'L' | 'XL';
    title: string;
    impact: string;
    effort: string;
    confidence: 'low' | 'medium' | 'high';
    benchmark_ref?: string;
  }>;
  data_gaps: Array<{
    metric: string;
    current_sample: number;
    required_sample: number;
    blocker: string;
  }>;
  generated_by: string | null;
  created_at: string;
}

// Funnel shape returned by admin_get_funnel_stats --------------------------

export interface FunnelStage {
  stage: string;
  count: number;
  conversion_from_prev: number;
  sample_size: number;
  data_sufficient: boolean;
}

export interface FunnelStats {
  period_start: string;
  period_end: string;
  stages: FunnelStage[];
  overall_visitor_to_paid: number;
  data_sufficient: boolean;
  min_sample_threshold: number;
}

export interface LiveSnapshot {
  active_sessions_last_30min: number;
  events_last_24h: number;
  new_signups_today: number;
  purchases_today: number;
  errors_last_1h: number;
  top_current_paths: Array<{ path: string; count: number }>;
  events_per_hour_last_24h: Array<{ hour: string; count: number }>;
  generated_at: string;
}

// Fable abuse / rate-limit admin views -----------------------------------

export interface FableTopUser {
  user_id: string;
  email: string | null;
  name: string;
  subscription_tier: string | null;
  subscription_status: string | null;
  is_admin: boolean;
  fable_suspended_until: string | null;
  total_calls: number;
  calls_24h: number;
  calls_1h: number;
  total_input_tokens: number | null;
  total_output_tokens: number | null;
  last_call_at: string;
}

export interface RateLimitViolation {
  id: string;
  user_id: string;
  violation_type: 'minute' | 'hour' | 'day' | 'month' | 'burst' | 'suspicious';
  occurred_at: string;
  details: Record<string, unknown>;
  email: string | null;
  name: string;
  subscription_tier: string | null;
  fable_suspended_until: string | null;
}

export interface SuspendedUser {
  user_id: string;
  email: string | null;
  name: string;
  subscription_tier: string | null;
  fable_suspended_until: string;
  fable_suspension_reason: string | null;
  violations_7d: number;
}

// Subscription & revenue analytics for AdminInsightsScreen
export interface SubscriptionStats {
  tier_breakdown: {
    free_users: number;
    premium_active: number;
    trialing: number;
    past_due: number;
    canceled: number;
    free_with_credits: number;
    total: number;
  };
  events_30d: {
    purchases_30d: number;
    cancellations_30d: number;
    inspirations_30d: number;
  };
  events_7d: {
    purchases_7d: number;
    cancellations_7d: number;
    inspirations_7d: number;
  };
  paywall: {
    shown_30d: number;
    trigger_breakdown: Record<string, number>;
  };
  recent_events: Array<{
    event_name: string;
    properties: Record<string, unknown>;
    created_at: string;
  }>;
  generated_at: string;
}
