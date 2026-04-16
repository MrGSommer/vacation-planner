-- Fable rate-limiting & abuse protection.
-- Protects against runaway Claude costs (Premium users have no Inspirationen-based gating).
--
-- Components:
--   1. profiles.fable_suspended_until / fable_suspension_reason  — admin override
--   2. rate_limit_violations table                               — audit trail
--   3. check_fable_rate_limit() function                         — called from ai-chat edge fn
--   4. Performance index on ai_usage_logs(user_id, created_at)

-- 1. Profile columns ---------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS fable_suspended_until timestamptz,
  ADD COLUMN IF NOT EXISTS fable_suspension_reason text;

-- 2. Violations table --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rate_limit_violations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  violation_type text NOT NULL, -- 'minute' | 'hour' | 'day' | 'month' | 'burst' | 'suspicious'
  occurred_at timestamptz NOT NULL DEFAULT now(),
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS rate_limit_violations_user_time_idx
  ON public.rate_limit_violations (user_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS rate_limit_violations_occurred_idx
  ON public.rate_limit_violations (occurred_at DESC);

ALTER TABLE public.rate_limit_violations ENABLE ROW LEVEL SECURITY;

-- Admin-only SELECT; inserts only via SECURITY DEFINER functions
DROP POLICY IF EXISTS "rate_limit_violations_admin_select" ON public.rate_limit_violations;
CREATE POLICY "rate_limit_violations_admin_select"
  ON public.rate_limit_violations FOR SELECT
  USING ((SELECT is_admin FROM public.profiles WHERE id = auth.uid()) = true);

-- 3. Performance index on ai_usage_logs (used by rate-check function) --------
CREATE INDEX IF NOT EXISTS ai_usage_logs_user_time_idx
  ON public.ai_usage_logs (user_id, created_at DESC);

-- 4. Rate-limit check function ----------------------------------------------
-- Returns jsonb:
--   { allowed: bool, limit_type?: text, current?: int, max?: int, retry_after?: int, suspended_until?: text }
CREATE OR REPLACE FUNCTION public.check_fable_rate_limit(
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_is_admin boolean;
  v_tier text;
  v_suspended_until timestamptz;
  v_premium boolean;
  v_minute_limit int;
  v_hour_limit int;
  v_day_limit int;
  v_month_limit int;
  v_count_minute int;
  v_count_hour int;
  v_count_day int;
  v_count_month int;
  v_burst_count int;
BEGIN
  -- Load profile
  SELECT
    p.is_admin,
    p.fable_suspended_until,
    (p.subscription_tier = 'premium'
      AND (p.subscription_status = 'active'
           OR (p.subscription_status = 'trialing'
               AND (p.subscription_period_end IS NULL OR p.subscription_period_end > now()))
           OR p.subscription_status = 'past_due'))
  INTO v_is_admin, v_suspended_until, v_premium
  FROM public.profiles p
  WHERE p.id = p_user_id;

  -- Admin suspension check
  IF v_suspended_until IS NOT NULL AND v_suspended_until > now() THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'limit_type', 'suspended',
      'suspended_until', v_suspended_until,
      'retry_after', EXTRACT(EPOCH FROM (v_suspended_until - now()))::int
    );
  END IF;

  -- Determine tier + limits
  IF COALESCE(v_is_admin, false) THEN
    v_tier := 'admin';
    v_minute_limit := 30; v_hour_limit := 300; v_day_limit := 5000; v_month_limit := NULL;
  ELSIF COALESCE(v_premium, false) THEN
    v_tier := 'premium';
    v_minute_limit := 10; v_hour_limit := 60; v_day_limit := 200; v_month_limit := 1000;
  ELSE
    v_tier := 'free';
    v_minute_limit := 5; v_hour_limit := 30; v_day_limit := 50; v_month_limit := NULL;
  END IF;

  -- Count recent AI usage
  SELECT
    COUNT(*) FILTER (WHERE created_at > now() - interval '1 minute'),
    COUNT(*) FILTER (WHERE created_at > now() - interval '1 hour'),
    COUNT(*) FILTER (WHERE created_at > now() - interval '1 day'),
    COUNT(*) FILTER (WHERE created_at > now() - interval '1 month'),
    COUNT(*) FILTER (WHERE created_at > now() - interval '10 seconds')
  INTO v_count_minute, v_count_hour, v_count_day, v_count_month, v_burst_count
  FROM public.ai_usage_logs
  WHERE user_id = p_user_id;

  -- Check windows in order of smallest first (most precise feedback)
  IF v_count_minute >= v_minute_limit THEN
    INSERT INTO public.rate_limit_violations (user_id, violation_type, details)
    VALUES (p_user_id, 'minute', jsonb_build_object('current', v_count_minute, 'max', v_minute_limit, 'tier', v_tier));
    RETURN jsonb_build_object(
      'allowed', false, 'limit_type', 'minute',
      'current', v_count_minute, 'max', v_minute_limit, 'retry_after', 60
    );
  END IF;

  IF v_count_hour >= v_hour_limit THEN
    INSERT INTO public.rate_limit_violations (user_id, violation_type, details)
    VALUES (p_user_id, 'hour', jsonb_build_object('current', v_count_hour, 'max', v_hour_limit, 'tier', v_tier));
    RETURN jsonb_build_object(
      'allowed', false, 'limit_type', 'hour',
      'current', v_count_hour, 'max', v_hour_limit, 'retry_after', 3600
    );
  END IF;

  IF v_count_day >= v_day_limit THEN
    INSERT INTO public.rate_limit_violations (user_id, violation_type, details)
    VALUES (p_user_id, 'day', jsonb_build_object('current', v_count_day, 'max', v_day_limit, 'tier', v_tier));
    RETURN jsonb_build_object(
      'allowed', false, 'limit_type', 'day',
      'current', v_count_day, 'max', v_day_limit, 'retry_after', 86400
    );
  END IF;

  IF v_month_limit IS NOT NULL AND v_count_month >= v_month_limit THEN
    INSERT INTO public.rate_limit_violations (user_id, violation_type, details)
    VALUES (p_user_id, 'month', jsonb_build_object('current', v_count_month, 'max', v_month_limit, 'tier', v_tier));
    RETURN jsonb_build_object(
      'allowed', false, 'limit_type', 'month',
      'current', v_count_month, 'max', v_month_limit, 'retry_after', 2592000
    );
  END IF;

  -- Burst detection (>5 requests in 10s): log but don't block (burst ≠ abuse on its own).
  IF v_burst_count > 5 THEN
    INSERT INTO public.rate_limit_violations (user_id, violation_type, details)
    VALUES (p_user_id, 'burst', jsonb_build_object('count', v_burst_count, 'window_s', 10, 'tier', v_tier));
  END IF;

  -- Auto-suspend if 10+ violations in 24h
  IF (SELECT COUNT(*) FROM public.rate_limit_violations
      WHERE user_id = p_user_id AND occurred_at > now() - interval '24 hours') >= 10 THEN
    UPDATE public.profiles
      SET fable_suspended_until = now() + interval '24 hours',
          fable_suspension_reason = 'auto: 10+ violations in 24h'
      WHERE id = p_user_id AND fable_suspended_until IS NULL OR fable_suspended_until < now();
  END IF;

  RETURN jsonb_build_object('allowed', true, 'tier', v_tier);
END;
$$;

REVOKE ALL ON FUNCTION public.check_fable_rate_limit(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.check_fable_rate_limit(uuid) TO service_role;

COMMENT ON FUNCTION public.check_fable_rate_limit IS
  'Returns { allowed, limit_type?, current?, max?, retry_after? }. Called by ai-chat edge fn before any Claude request.';
