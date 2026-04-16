-- Admin RPCs for Fable rate-limit monitoring and manual suspension/unsuspension.
-- See 20260416140000_fable_rate_limiting.sql for the rate-check machinery.

-- 1. Top Fable consumers (last 7 days) ---------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_fable_top_users(p_days int DEFAULT 7)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_is_admin boolean;
  v_result jsonb;
BEGIN
  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = auth.uid();
  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_result
  FROM (
    SELECT
      l.user_id,
      p.email,
      COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '') AS name,
      p.subscription_tier,
      p.subscription_status,
      p.is_admin,
      p.fable_suspended_until,
      COUNT(*)::int AS total_calls,
      COUNT(*) FILTER (WHERE l.created_at > now() - interval '1 day')::int AS calls_24h,
      COUNT(*) FILTER (WHERE l.created_at > now() - interval '1 hour')::int AS calls_1h,
      SUM(l.input_tokens)::int AS total_input_tokens,
      SUM(l.output_tokens)::int AS total_output_tokens,
      MAX(l.created_at) AS last_call_at
    FROM public.ai_usage_logs l
    JOIN public.profiles p ON p.id = l.user_id
    WHERE l.created_at > now() - make_interval(days => p_days)
    GROUP BY l.user_id, p.email, p.first_name, p.last_name, p.subscription_tier, p.subscription_status, p.is_admin, p.fable_suspended_until
    ORDER BY total_calls DESC
    LIMIT 10
  ) t;

  RETURN v_result;
END;
$$;

-- 2. Recent rate-limit violations (last N hours) -----------------------------
CREATE OR REPLACE FUNCTION public.admin_get_recent_violations(p_hours int DEFAULT 24)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_is_admin boolean;
  v_result jsonb;
BEGIN
  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = auth.uid();
  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY (row_to_json(t)->>'occurred_at') DESC), '[]'::jsonb) INTO v_result
  FROM (
    SELECT
      v.id,
      v.user_id,
      v.violation_type,
      v.occurred_at,
      v.details,
      p.email,
      COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '') AS name,
      p.subscription_tier,
      p.fable_suspended_until
    FROM public.rate_limit_violations v
    JOIN public.profiles p ON p.id = v.user_id
    WHERE v.occurred_at > now() - make_interval(hours => p_hours)
    ORDER BY v.occurred_at DESC
    LIMIT 100
  ) t;

  RETURN v_result;
END;
$$;

-- 3. Currently suspended users ---------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_suspended_users()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_is_admin boolean;
  v_result jsonb;
BEGIN
  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = auth.uid();
  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_result
  FROM (
    SELECT
      p.id AS user_id,
      p.email,
      COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '') AS name,
      p.subscription_tier,
      p.fable_suspended_until,
      p.fable_suspension_reason,
      (SELECT COUNT(*) FROM public.rate_limit_violations WHERE user_id = p.id AND occurred_at > now() - interval '7 days')::int AS violations_7d
    FROM public.profiles p
    WHERE p.fable_suspended_until IS NOT NULL AND p.fable_suspended_until > now()
    ORDER BY p.fable_suspended_until DESC
  ) t;

  RETURN v_result;
END;
$$;

-- 4. Manual suspend / unsuspend ---------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_fable_suspension(
  p_user_id uuid,
  p_suspended_until timestamptz,   -- pass NULL to unsuspend
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_is_admin boolean;
  v_admin_id uuid := auth.uid();
BEGIN
  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = v_admin_id;
  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.profiles
    SET fable_suspended_until = p_suspended_until,
        fable_suspension_reason = CASE
          WHEN p_suspended_until IS NULL THEN NULL
          ELSE COALESCE(p_reason, 'manual: set by admin ' || v_admin_id::text)
        END
    WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'user_id', p_user_id,
    'fable_suspended_until', p_suspended_until,
    'fable_suspension_reason', CASE
      WHEN p_suspended_until IS NULL THEN NULL
      ELSE COALESCE(p_reason, 'manual: set by admin ' || v_admin_id::text)
    END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_fable_top_users(int) FROM public;
REVOKE ALL ON FUNCTION public.admin_get_recent_violations(int) FROM public;
REVOKE ALL ON FUNCTION public.admin_get_suspended_users() FROM public;
REVOKE ALL ON FUNCTION public.admin_set_fable_suspension(uuid, timestamptz, text) FROM public;

GRANT EXECUTE ON FUNCTION public.admin_get_fable_top_users(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_recent_violations(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_suspended_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_fable_suspension(uuid, timestamptz, text) TO authenticated;

COMMENT ON FUNCTION public.admin_get_fable_top_users IS 'Admin-only. Returns top 10 Fable users (by ai_usage_logs count) in last N days.';
COMMENT ON FUNCTION public.admin_get_recent_violations IS 'Admin-only. Returns rate_limit_violations from last N hours (max 100).';
COMMENT ON FUNCTION public.admin_get_suspended_users IS 'Admin-only. Returns currently suspended users (fable_suspended_until > now()).';
COMMENT ON FUNCTION public.admin_set_fable_suspension IS 'Admin-only. Sets or clears profiles.fable_suspended_until.';
