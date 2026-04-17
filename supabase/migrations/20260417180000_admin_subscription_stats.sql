-- Admin RPC: subscription breakdown + recent monetization events
-- Used by AdminInsightsScreen and ai-insights-report

CREATE OR REPLACE FUNCTION admin_get_subscription_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _result jsonb;
BEGIN
  PERFORM _require_admin();

  WITH tier_counts AS (
    SELECT
      COUNT(*) FILTER (WHERE subscription_tier = 'free' AND subscription_status != 'trialing') AS free_users,
      COUNT(*) FILTER (WHERE subscription_tier = 'premium' AND subscription_status = 'active') AS premium_active,
      COUNT(*) FILTER (WHERE subscription_status = 'trialing') AS trialing,
      COUNT(*) FILTER (WHERE subscription_status = 'past_due') AS past_due,
      COUNT(*) FILTER (WHERE subscription_status = 'canceled') AS canceled,
      COUNT(*) FILTER (WHERE ai_credits_purchased > 0 AND subscription_tier = 'free') AS free_with_credits,
      COUNT(*) AS total
    FROM profiles
  ),
  recent_events AS (
    SELECT
      event_name,
      properties,
      created_at
    FROM analytics_events
    WHERE event_name IN ('subscription_purchased', 'subscription_cancelled', 'inspirations_purchased')
      AND created_at > NOW() - INTERVAL '30 days'
    ORDER BY created_at DESC
    LIMIT 20
  ),
  event_counts_30d AS (
    SELECT
      COUNT(*) FILTER (WHERE event_name = 'subscription_purchased') AS purchases_30d,
      COUNT(*) FILTER (WHERE event_name = 'subscription_cancelled') AS cancellations_30d,
      COUNT(*) FILTER (WHERE event_name = 'inspirations_purchased') AS inspirations_30d
    FROM analytics_events
    WHERE event_name IN ('subscription_purchased', 'subscription_cancelled', 'inspirations_purchased')
      AND created_at > NOW() - INTERVAL '30 days'
  ),
  event_counts_7d AS (
    SELECT
      COUNT(*) FILTER (WHERE event_name = 'subscription_purchased') AS purchases_7d,
      COUNT(*) FILTER (WHERE event_name = 'subscription_cancelled') AS cancellations_7d,
      COUNT(*) FILTER (WHERE event_name = 'inspirations_purchased') AS inspirations_7d
    FROM analytics_events
    WHERE event_name IN ('subscription_purchased', 'subscription_cancelled', 'inspirations_purchased')
      AND created_at > NOW() - INTERVAL '7 days'
  ),
  paywall_stats AS (
    SELECT
      COALESCE(SUM(cnt), 0)::int AS paywall_shown_30d,
      jsonb_object_agg(
        COALESCE(trigger_key, 'unknown'),
        cnt
      ) AS trigger_breakdown
    FROM (
      SELECT properties->>'trigger' AS trigger_key, COUNT(*) AS cnt
      FROM analytics_events
      WHERE event_name = 'paywall_shown'
        AND created_at > NOW() - INTERVAL '30 days'
      GROUP BY properties->>'trigger'
    ) sub
  )
  SELECT jsonb_build_object(
    'tier_breakdown', (SELECT row_to_json(tier_counts) FROM tier_counts),
    'events_30d', (SELECT row_to_json(event_counts_30d) FROM event_counts_30d),
    'events_7d', (SELECT row_to_json(event_counts_7d) FROM event_counts_7d),
    'paywall', (SELECT jsonb_build_object(
      'shown_30d', paywall_shown_30d,
      'trigger_breakdown', COALESCE(trigger_breakdown, '{}'::jsonb)
    ) FROM paywall_stats),
    'recent_events', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'event_name', event_name,
      'properties', properties,
      'created_at', created_at
    )) FROM recent_events), '[]'::jsonb),
    'generated_at', NOW()
  ) INTO _result;

  RETURN _result;
END;
$$;
