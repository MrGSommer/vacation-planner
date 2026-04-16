// Rate-limit config for Fable (ai-chat). Keep these values in sync with the DB
// function `check_fable_rate_limit` (defined in migration 20260416_fable_rate_limiting.sql)
// if you edit them. Values are deliberately loose for regular users and tight
// enough to block scripts/bot abuse.
//
// Tier lookup hierarchy (first match wins):
//   1. profile.is_admin = true       → admin
//   2. subscription_tier = 'premium' → premium
//   3. otherwise                     → free (credits-based)

export type RateLimitTier = 'admin' | 'premium' | 'free';

export interface RateLimits {
  per_minute: number;
  per_hour: number;
  per_day: number;
  per_month: number | null; // null = unlimited
}

export const RATE_LIMITS: Record<RateLimitTier, RateLimits> = {
  admin: { per_minute: 30, per_hour: 300, per_day: 5000, per_month: null },
  premium: { per_minute: 10, per_hour: 60, per_day: 200, per_month: 1000 },
  free: { per_minute: 5, per_hour: 30, per_day: 50, per_month: null },
};

/** Burst threshold — how many requests in 10 seconds counts as suspicious. */
export const BURST_WINDOW_SECONDS = 10;
export const BURST_THRESHOLD = 5;
