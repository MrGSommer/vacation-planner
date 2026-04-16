// Industry benchmarks used by ai-insights-report for evidence-based analysis.
// Update manually when new industry reports are released. Each benchmark
// MUST cite source + URL + snapshot date so the KI can quote it.

export const SUBSCRIPTION_BENCHMARKS = {
  source: 'RevenueCat State of Subscription Apps 2025',
  url: 'https://www.revenuecat.com/state-of-subscription-apps-2025/',
  last_updated: '2026-04-16',
  metrics: {
    // Median trial-to-paid conversion across consumer subscription apps
    trial_to_paid_median: 0.30,
    // Month-12 retention (paid subscribers still subscribed 12 months later)
    month_12_retention_median: 0.35,
    // Week-1 trial conversion (trial started → paid within 7 days)
    week_1_trial_conversion: 0.12,
    // Churn rate (monthly)
    monthly_churn_median: 0.05,
    // Top 25% quartile benchmarks
    trial_to_paid_top_quartile: 0.45,
    month_12_retention_top_quartile: 0.52,
  },
};

export const TRAVEL_APP_BENCHMARKS = {
  source: 'Mobile Growth Reports — Travel Vertical (Adjust 2024 / Sensor Tower 2025)',
  last_updated: '2026-04-16',
  metrics: {
    // Day-1 retention (returning next day)
    day_1_retention: 0.28,
    day_7_retention: 0.15,
    day_30_retention: 0.08,
    // Session count (median sessions per active user per month)
    sessions_per_user_per_month_median: 6,
    // Median time to first meaningful action (first trip created)
    median_time_to_activation_hours: 2,
  },
};

export const LANDING_CONVERSION_BENCHMARKS = {
  source: 'Unbounce Conversion Benchmark Report 2024 + SaaS Landing Best Practices',
  last_updated: '2026-04-16',
  metrics: {
    // Landing page conversion (visit → signup) — SaaS median
    landing_to_signup_median: 0.045,
    landing_to_signup_top_quartile: 0.10,
    // Signup → Activation (first meaningful action)
    signup_to_activation_median: 0.40,
    // Activation → Paid
    activation_to_paid_median: 0.08,
  },
};

// Serialized snapshot passed into the KI prompt.
export const BENCHMARKS_FOR_PROMPT = {
  subscription: SUBSCRIPTION_BENCHMARKS,
  travel: TRAVEL_APP_BENCHMARKS,
  landing: LANDING_CONVERSION_BENCHMARKS,
};
