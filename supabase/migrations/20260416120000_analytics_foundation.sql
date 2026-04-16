-- ============================================================
-- Analytics Foundation
--   - Session tracking (anonymous + authed, bridged via session_id)
--   - Unified event log (replaces landing_events for new data)
--   - Profile engagement columns (last_seen_at, app_opens_total)
--   - Admin RPCs with sample-size / data_sufficient flagging
--   - Insights reports storage for AI-generated weekly summaries
-- ============================================================

-- ---------- Tables ------------------------------------------------

CREATE TABLE IF NOT EXISTS public.analytics_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text UNIQUE NOT NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  first_path text,
  referrer text,
  user_agent text,
  platform text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  events_count integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_analytics_sessions_user ON public.analytics_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_sessions_last_seen ON public.analytics_sessions(last_seen_at DESC);

CREATE TABLE IF NOT EXISTS public.analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  event_name text NOT NULL,
  event_category text NOT NULL CHECK (event_category IN ('landing','auth','activation','monetization','retention','system')),
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  path text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_analytics_events_session_time ON public.analytics_events(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_user_time ON public.analytics_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_name_time ON public.analytics_events(event_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_category_time ON public.analytics_events(event_category, created_at DESC);

CREATE TABLE IF NOT EXISTS public.insights_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start date NOT NULL,
  period_end date NOT NULL,
  report_type text NOT NULL CHECK (report_type IN ('weekly','on_demand')),
  focus text NOT NULL DEFAULT 'full' CHECK (focus IN ('full','funnel','retention','monetization','engagement')),
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary text,
  findings jsonb NOT NULL DEFAULT '[]'::jsonb,
  actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  data_gaps jsonb NOT NULL DEFAULT '[]'::jsonb,
  generated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_insights_reports_created ON public.insights_reports(created_at DESC);

-- ---------- Profile engagement columns ----------------------------

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS app_opens_total integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_profiles_last_seen ON public.profiles(last_seen_at DESC NULLS LAST);

-- ---------- Row Level Security -----------------------------------

ALTER TABLE public.analytics_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insights_reports ENABLE ROW LEVEL SECURITY;

-- Insert policies: everyone may write events/sessions (incl. anon)
DROP POLICY IF EXISTS "analytics_sessions insert any" ON public.analytics_sessions;
CREATE POLICY "analytics_sessions insert any" ON public.analytics_sessions
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "analytics_sessions update any" ON public.analytics_sessions;
CREATE POLICY "analytics_sessions update any" ON public.analytics_sessions
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "analytics_events insert any" ON public.analytics_events;
CREATE POLICY "analytics_events insert any" ON public.analytics_events
  FOR INSERT TO anon, authenticated WITH CHECK (true);

-- Select policies: admin only
DROP POLICY IF EXISTS "analytics_sessions admin select" ON public.analytics_sessions;
CREATE POLICY "analytics_sessions admin select" ON public.analytics_sessions
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true));

DROP POLICY IF EXISTS "analytics_events admin select" ON public.analytics_events;
CREATE POLICY "analytics_events admin select" ON public.analytics_events
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true));

DROP POLICY IF EXISTS "insights_reports admin select" ON public.insights_reports;
CREATE POLICY "insights_reports admin select" ON public.insights_reports
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true));

DROP POLICY IF EXISTS "insights_reports admin insert" ON public.insights_reports;
CREATE POLICY "insights_reports admin insert" ON public.insights_reports
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true));

-- ---------- Trigger: session_start keeps profile engagement fresh -

CREATE OR REPLACE FUNCTION public.on_analytics_event_update_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NEW.user_id IS NOT NULL AND NEW.event_name = 'session_start' THEN
    UPDATE public.profiles
       SET last_seen_at = NEW.created_at,
           app_opens_total = app_opens_total + 1,
           first_seen_at = COALESCE(first_seen_at, NEW.created_at)
     WHERE id = NEW.user_id;
  ELSIF NEW.user_id IS NOT NULL THEN
    UPDATE public.profiles
       SET last_seen_at = GREATEST(COALESCE(last_seen_at, NEW.created_at), NEW.created_at)
     WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_analytics_event_update_profile ON public.analytics_events;
CREATE TRIGGER trg_analytics_event_update_profile
  AFTER INSERT ON public.analytics_events
  FOR EACH ROW EXECUTE FUNCTION public.on_analytics_event_update_profile();

-- ---------- RPC: log_analytics_event -----------------------------

CREATE OR REPLACE FUNCTION public.log_analytics_event(
  p_session_id text,
  p_event_name text,
  p_category text,
  p_properties jsonb DEFAULT '{}'::jsonb,
  p_path text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_referrer text DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_platform text DEFAULT NULL,
  p_utm_source text DEFAULT NULL,
  p_utm_medium text DEFAULT NULL,
  p_utm_campaign text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_event_id uuid;
  v_uid uuid;
BEGIN
  IF p_session_id IS NULL OR length(p_session_id) = 0 THEN
    RAISE EXCEPTION 'session_id required';
  END IF;
  IF p_event_name IS NULL OR length(p_event_name) = 0 THEN
    RAISE EXCEPTION 'event_name required';
  END IF;
  IF p_category NOT IN ('landing','auth','activation','monetization','retention','system') THEN
    RAISE EXCEPTION 'invalid category: %', p_category;
  END IF;

  -- Resolve user: prefer explicit (server-side calls), fall back to auth.uid()
  v_uid := COALESCE(p_user_id, auth.uid());

  -- Upsert session row
  INSERT INTO public.analytics_sessions (
    session_id, user_id, first_path, referrer, user_agent, platform,
    utm_source, utm_medium, utm_campaign, events_count
  ) VALUES (
    p_session_id, v_uid, p_path, p_referrer, p_user_agent, p_platform,
    p_utm_source, p_utm_medium, p_utm_campaign, 1
  )
  ON CONFLICT (session_id) DO UPDATE SET
    last_seen_at = now(),
    events_count = public.analytics_sessions.events_count + 1,
    user_id = COALESCE(public.analytics_sessions.user_id, EXCLUDED.user_id);

  -- Insert the event
  INSERT INTO public.analytics_events (
    session_id, user_id, event_name, event_category, properties, path
  ) VALUES (
    p_session_id, v_uid, p_event_name, p_category, COALESCE(p_properties,'{}'::jsonb), p_path
  )
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_analytics_event(text,text,text,jsonb,text,uuid,text,text,text,text,text,text) TO anon, authenticated;

-- ---------- RPC: link_session_to_user ----------------------------

CREATE OR REPLACE FUNCTION public.link_session_to_user(
  p_session_id text,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_first_seen timestamptz;
BEGIN
  IF p_session_id IS NULL OR p_user_id IS NULL THEN
    RETURN;
  END IF;
  -- Only caller may link their own session
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE public.analytics_sessions
     SET user_id = p_user_id,
         last_seen_at = now()
   WHERE session_id = p_session_id;

  -- Backfill prior events created during anon phase
  UPDATE public.analytics_events
     SET user_id = p_user_id
   WHERE session_id = p_session_id
     AND user_id IS NULL;

  -- Set first_seen_at on profile if still empty (prefer earliest session time)
  SELECT first_seen_at INTO v_first_seen
    FROM public.analytics_sessions
   WHERE session_id = p_session_id;

  UPDATE public.profiles
     SET first_seen_at = LEAST(COALESCE(first_seen_at, v_first_seen), COALESCE(v_first_seen, first_seen_at))
   WHERE id = p_user_id
     AND (first_seen_at IS NULL OR first_seen_at > v_first_seen);
END;
$$;

GRANT EXECUTE ON FUNCTION public.link_session_to_user(text,uuid) TO authenticated;

-- ---------- Admin RPCs --------------------------------------------

-- Helper: admin guard
CREATE OR REPLACE FUNCTION public._require_admin()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
END;
$$;

-- Live snapshot -----------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_get_live_snapshot()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM public._require_admin();

  SELECT jsonb_build_object(
    'active_sessions_last_30min', (
      SELECT COUNT(*) FROM public.analytics_sessions
       WHERE last_seen_at > now() - interval '30 minutes'
    ),
    'events_last_24h', (
      SELECT COUNT(*) FROM public.analytics_events
       WHERE created_at > now() - interval '24 hours'
    ),
    'new_signups_today', (
      SELECT COUNT(*) FROM public.profiles
       WHERE created_at >= date_trunc('day', now())
    ),
    'purchases_today', (
      SELECT COUNT(*) FROM public.analytics_events
       WHERE event_name IN ('subscription_purchased','inspirations_purchased')
         AND created_at >= date_trunc('day', now())
    ),
    'errors_last_1h', (
      SELECT COUNT(*) FROM public.app_error_logs
       WHERE created_at > now() - interval '1 hour'
    ),
    'top_current_paths', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('path', path, 'count', cnt))
        FROM (
          SELECT path, COUNT(*) AS cnt
            FROM public.analytics_events
           WHERE created_at > now() - interval '1 hour'
             AND path IS NOT NULL
           GROUP BY path
           ORDER BY cnt DESC
           LIMIT 5
        ) t
    ), '[]'::jsonb),
    'events_per_hour_last_24h', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('hour', hour_ts, 'count', cnt) ORDER BY hour_ts)
        FROM (
          SELECT date_trunc('hour', created_at) AS hour_ts, COUNT(*) AS cnt
            FROM public.analytics_events
           WHERE created_at > now() - interval '24 hours'
           GROUP BY hour_ts
        ) h
    ), '[]'::jsonb),
    'generated_at', now()
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_live_snapshot() TO authenticated;

-- Funnel stats ------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_get_funnel_stats(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_from timestamptz;
  v_to timestamptz;
  v_visitors bigint;
  v_plan_generated bigint;
  v_signup_click bigint;
  v_signups bigint;
  v_activated bigint;
  v_purchased bigint;
  v_min_sample int := 30;
  v_stages jsonb;
BEGIN
  PERFORM public._require_admin();

  v_to := COALESCE(p_to, now());
  v_from := COALESCE(p_from, v_to - interval '30 days');

  -- Visitors = unique sessions that fired landing_page_view OR any event
  SELECT COUNT(DISTINCT session_id) INTO v_visitors
    FROM public.analytics_events
   WHERE created_at BETWEEN v_from AND v_to
     AND event_name IN ('landing_page_view','session_start');

  SELECT COUNT(DISTINCT session_id) INTO v_plan_generated
    FROM public.analytics_events
   WHERE created_at BETWEEN v_from AND v_to
     AND event_name = 'landing_plan_generated';

  SELECT COUNT(DISTINCT session_id) INTO v_signup_click
    FROM public.analytics_events
   WHERE created_at BETWEEN v_from AND v_to
     AND event_name IN ('landing_signup_click','signup_started');

  SELECT COUNT(DISTINCT user_id) INTO v_signups
    FROM public.analytics_events
   WHERE created_at BETWEEN v_from AND v_to
     AND event_name = 'signup_completed'
     AND user_id IS NOT NULL;

  SELECT COUNT(DISTINCT user_id) INTO v_activated
    FROM public.analytics_events
   WHERE created_at BETWEEN v_from AND v_to
     AND event_name IN ('first_trip_created','first_fable_use','first_plan_generated')
     AND user_id IS NOT NULL;

  SELECT COUNT(DISTINCT user_id) INTO v_purchased
    FROM public.analytics_events
   WHERE created_at BETWEEN v_from AND v_to
     AND event_name = 'subscription_purchased'
     AND user_id IS NOT NULL;

  v_stages := jsonb_build_array(
    jsonb_build_object('stage','visitors','count',v_visitors,'conversion_from_prev',1.0,
                       'sample_size',v_visitors,'data_sufficient', v_visitors >= v_min_sample),
    jsonb_build_object('stage','plan_generated','count',v_plan_generated,
                       'conversion_from_prev', CASE WHEN v_visitors>0 THEN round(v_plan_generated::numeric/v_visitors,4) ELSE 0 END,
                       'sample_size',v_plan_generated,'data_sufficient', v_plan_generated >= v_min_sample),
    jsonb_build_object('stage','signup_click','count',v_signup_click,
                       'conversion_from_prev', CASE WHEN v_visitors>0 THEN round(v_signup_click::numeric/v_visitors,4) ELSE 0 END,
                       'sample_size',v_signup_click,'data_sufficient', v_signup_click >= v_min_sample),
    jsonb_build_object('stage','signups','count',v_signups,
                       'conversion_from_prev', CASE WHEN v_signup_click>0 THEN round(v_signups::numeric/v_signup_click,4) ELSE 0 END,
                       'sample_size',v_signups,'data_sufficient', v_signups >= v_min_sample),
    jsonb_build_object('stage','activated','count',v_activated,
                       'conversion_from_prev', CASE WHEN v_signups>0 THEN round(v_activated::numeric/v_signups,4) ELSE 0 END,
                       'sample_size',v_activated,'data_sufficient', v_activated >= v_min_sample),
    jsonb_build_object('stage','purchased','count',v_purchased,
                       'conversion_from_prev', CASE WHEN v_activated>0 THEN round(v_purchased::numeric/v_activated,4) ELSE 0 END,
                       'sample_size',v_purchased,'data_sufficient', v_purchased >= v_min_sample)
  );

  RETURN jsonb_build_object(
    'period_start', v_from,
    'period_end', v_to,
    'stages', v_stages,
    'overall_visitor_to_paid', CASE WHEN v_visitors>0 THEN round(v_purchased::numeric/v_visitors,4) ELSE 0 END,
    'data_sufficient', v_visitors >= v_min_sample,
    'min_sample_threshold', v_min_sample
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_funnel_stats(timestamptz,timestamptz) TO authenticated;

-- ---------- Backfill: landing_events → analytics_events ----------

INSERT INTO public.analytics_events (session_id, event_name, event_category, properties, created_at)
SELECT
  COALESCE(le.session_id, 'legacy_' || le.id::text) AS session_id,
  CASE le.event_type
    WHEN 'page_view'       THEN 'landing_page_view'
    WHEN 'plan_generated'  THEN 'landing_plan_generated'
    WHEN 'signup_click'    THEN 'landing_signup_click'
    WHEN 'registered'      THEN 'signup_completed'
    WHEN 'waitlisted'      THEN 'landing_waitlist_joined'
    ELSE le.event_type
  END AS event_name,
  CASE le.event_type
    WHEN 'registered' THEN 'auth'
    ELSE 'landing'
  END AS event_category,
  jsonb_strip_nulls(jsonb_build_object(
    'query', le.query,
    'referrer', le.referrer,
    'user_agent', le.user_agent,
    'backfilled', true
  )) AS properties,
  le.created_at
FROM public.landing_events le
WHERE NOT EXISTS (
  SELECT 1 FROM public.analytics_events ae
   WHERE ae.properties ? 'backfilled'
     AND ae.created_at = le.created_at
     AND ae.session_id = COALESCE(le.session_id, 'legacy_' || le.id::text)
);

-- Matching sessions for backfilled events (so JOINs don't explode later)
INSERT INTO public.analytics_sessions (session_id, first_seen_at, last_seen_at, referrer, user_agent, events_count)
SELECT le.session_id,
       MIN(le.created_at),
       MAX(le.created_at),
       MAX(le.referrer),
       MAX(le.user_agent),
       COUNT(*)
  FROM public.landing_events le
 WHERE le.session_id IS NOT NULL
 GROUP BY le.session_id
ON CONFLICT (session_id) DO NOTHING;
