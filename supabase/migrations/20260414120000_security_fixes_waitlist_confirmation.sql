-- ============================================================
-- Security Fixes + Waitlist Email Confirmation
-- ============================================================

-- 1. Fix function search_path (Security Advisor warnings)
ALTER FUNCTION public.clear_trip_data_cascade(uuid, jsonb) SET search_path TO '';
ALTER FUNCTION public.duplicate_trip_atomic(uuid, uuid) SET search_path TO '';

-- 1c. admin_get_beta_stats — recreate with qualified table names
CREATE OR REPLACE FUNCTION public.admin_get_beta_stats()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  result jsonb;
  error_components jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('component', e.component, 'count', e.cnt)), '[]'::jsonb)
  INTO error_components
  FROM (
    SELECT component, COUNT(*) as cnt
    FROM public.app_error_logs
    WHERE created_at > NOW() - INTERVAL '7 days'
    GROUP BY component ORDER BY cnt DESC LIMIT 5
  ) e;

  SELECT jsonb_build_object(
    'total_users', (SELECT COUNT(*) FROM public.profiles),
    'premium_users', (SELECT COUNT(*) FROM public.profiles WHERE subscription_tier = 'premium'),
    'trialing_users', (SELECT COUNT(*) FROM public.profiles WHERE subscription_status = 'trialing'),
    'signups_today', (SELECT COUNT(*) FROM public.profiles WHERE created_at > NOW() - INTERVAL '24 hours'),
    'signups_7d', (SELECT COUNT(*) FROM public.profiles WHERE created_at > NOW() - INTERVAL '7 days'),
    'signups_30d', (SELECT COUNT(*) FROM public.profiles WHERE created_at > NOW() - INTERVAL '30 days'),
    'conversion_rate', (SELECT CASE WHEN COUNT(*) > 0 THEN ROUND(COUNT(*) FILTER (WHERE subscription_tier = 'premium')::numeric / COUNT(*)::numeric * 100, 1) ELSE 0 END FROM public.profiles),
    'dau', (SELECT COUNT(DISTINCT user_id) FROM public.ai_usage_logs WHERE created_at > NOW() - INTERVAL '24 hours'),
    'wau', (SELECT COUNT(DISTINCT user_id) FROM public.ai_usage_logs WHERE created_at > NOW() - INTERVAL '7 days'),
    'mau', (SELECT COUNT(DISTINCT user_id) FROM public.ai_usage_logs WHERE created_at > NOW() - INTERVAL '30 days'),
    'total_trips', (SELECT COUNT(*) FROM public.trips),
    'trips_7d', (SELECT COUNT(*) FROM public.trips WHERE created_at > NOW() - INTERVAL '7 days'),
    'total_activities', (SELECT COUNT(*) FROM public.activities),
    'avg_activities_per_trip', COALESCE((SELECT ROUND(AVG(cnt)::numeric, 1) FROM (SELECT COUNT(*) as cnt FROM public.activities GROUP BY trip_id) s1), 0),
    'total_packing_items', (SELECT COUNT(*) FROM public.packing_items),
    'total_photos', (SELECT COUNT(*) FROM public.photos),
    'users_with_trips', (SELECT COUNT(DISTINCT owner_id) FROM public.trips),
    'users_using_fable', (SELECT COUNT(DISTINCT user_id) FROM public.ai_usage_logs),
    'trips_with_packing', (SELECT COUNT(DISTINCT pl.trip_id) FROM public.packing_lists pl JOIN public.packing_items pi ON pi.list_id = pl.id),
    'trips_with_budget', (SELECT COUNT(DISTINCT trip_id) FROM public.budget_categories),
    'trips_with_stops', (SELECT COUNT(DISTINCT trip_id) FROM public.activities WHERE category IN ('hotel', 'stop')),
    'trips_with_photos', (SELECT COUNT(DISTINCT trip_id) FROM public.photos),
    'total_invites', (SELECT COUNT(*) FROM public.trip_invitations),
    'accepted_invites', (SELECT COUNT(*) FROM public.trip_invitations WHERE status = 'accepted'),
    'collab_trips', (SELECT COUNT(*) FROM (SELECT trip_id FROM public.trip_collaborators GROUP BY trip_id HAVING COUNT(*) > 1) s2),
    'ai_calls_today', (SELECT COUNT(*) FROM public.ai_usage_logs WHERE created_at > NOW() - INTERVAL '24 hours'),
    'ai_calls_7d', (SELECT COUNT(*) FROM public.ai_usage_logs WHERE created_at > NOW() - INTERVAL '7 days'),
    'ai_calls_30d', (SELECT COUNT(*) FROM public.ai_usage_logs WHERE created_at > NOW() - INTERVAL '30 days'),
    'ai_unique_users_7d', (SELECT COUNT(DISTINCT user_id) FROM public.ai_usage_logs WHERE created_at > NOW() - INTERVAL '7 days'),
    'ai_avg_response_ms', (SELECT COALESCE(AVG(duration_ms), 0)::int FROM public.ai_usage_logs WHERE duration_ms IS NOT NULL AND created_at > NOW() - INTERVAL '7 days'),
    'total_credits_consumed', (SELECT COALESCE(SUM(credits_charged), 0) FROM public.ai_usage_logs),
    'ai_conversations', (SELECT COUNT(*) FROM public.ai_usage_logs WHERE task_type = 'conversation'),
    'ai_plan_generations', (SELECT COUNT(*) FROM public.ai_usage_logs WHERE task_type = 'plan_generation'),
    'ai_web_searches', (SELECT COUNT(*) FROM public.ai_usage_logs WHERE task_type = 'web_search'),
    'ai_agent_calls', (SELECT COUNT(*) FROM public.ai_usage_logs WHERE task_type LIKE 'agent_%'),
    'errors_today', (SELECT COUNT(*) FROM public.app_error_logs WHERE created_at > NOW() - INTERVAL '24 hours'),
    'errors_7d', (SELECT COUNT(*) FROM public.app_error_logs WHERE created_at > NOW() - INTERVAL '7 days'),
    'critical_errors_7d', (SELECT COUNT(*) FROM public.app_error_logs WHERE severity = 'critical' AND created_at > NOW() - INTERVAL '7 days'),
    'top_error_components', error_components,
    'feedback_total', (SELECT COUNT(*) FROM public.beta_feedback),
    'feedback_open', (SELECT COUNT(*) FROM public.beta_feedback WHERE status IN ('new', 'in_progress')),
    'feedback_bugs', (SELECT COUNT(*) FROM public.beta_feedback WHERE type = 'bug' AND status NOT IN ('resolved', 'wont_fix'))
  ) INTO result;

  RETURN result;
END;
$function$;

-- 2. Drop public bucket SELECT policies
DROP POLICY IF EXISTS "activity-documents: public read" ON storage.objects;
DROP POLICY IF EXISTS "Public avatar read access" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can read trip photos" ON storage.objects;

-- 3. Waitlist email confirmation columns
ALTER TABLE public.waitlist
  ADD COLUMN IF NOT EXISTS confirmed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS confirmation_token uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text;

UPDATE public.waitlist SET confirmed = true, confirmed_at = created_at
WHERE confirmed IS NOT TRUE;

-- Migrate existing full_name data to first_name/last_name
UPDATE public.waitlist
SET
  first_name = CASE WHEN full_name IS NOT NULL THEN split_part(full_name, ' ', 1) ELSE NULL END,
  last_name = CASE WHEN full_name IS NOT NULL AND position(' ' in full_name) > 0
    THEN substring(full_name from position(' ' in full_name) + 1)
    ELSE NULL END
WHERE first_name IS NULL AND full_name IS NOT NULL;

-- 4. Admin trigger: only fire when confirmed = true (on UPDATE)
DROP TRIGGER IF EXISTS on_waitlist_created_notify_admin ON public.waitlist;

CREATE TRIGGER on_waitlist_confirmed_notify_admin
  AFTER UPDATE ON public.waitlist
  FOR EACH ROW
  WHEN (NEW.confirmed = true AND OLD.confirmed IS DISTINCT FROM true)
  EXECUTE FUNCTION public.notify_admin_on_waitlist();

-- 5. Send confirmation email on INSERT via trigger
CREATE OR REPLACE FUNCTION public.send_waitlist_confirmation_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  _url text;
  _secret text;
  _confirm_url text;
  _html text;
  _name text;
BEGIN
  SELECT decrypted_secret INTO _url FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1;
  SELECT decrypted_secret INTO _secret FROM vault.decrypted_secrets WHERE name = 'internal_api_secret' LIMIT 1;

  _name := COALESCE(NULLIF(trim(coalesce(NEW.first_name, '') || ' ' || coalesce(NEW.last_name, '')), ''), NEW.full_name, 'dort');
  _confirm_url := 'https://wayfable.ch/waitlist/confirm?token=' || NEW.confirmation_token::text;

  _html := '<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>'
    || '<body style="margin:0;padding:0;background:#f5f7fa;font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,sans-serif">'
    || '<div style="max-width:520px;margin:40px auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">'
    || '<div style="background:linear-gradient(135deg,#0EA5E9,#6366F1);padding:40px 32px;text-align:center">'
    || '<h1 style="color:#fff;margin:0;font-size:28px;font-weight:700">WayFable</h1>'
    || '<p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:16px">Dein Reisebegleiter</p>'
    || '</div>'
    || '<div style="padding:32px">'
    || '<h2 style="color:#1e293b;margin:0 0 12px;font-size:22px">Hallo ' || _name || '!</h2>'
    || '<p style="color:#475569;font-size:16px;line-height:1.6;margin:0 0 24px">'
    || 'Vielen Dank für dein Interesse an WayFable! Bitte bestätige deine E-Mail-Adresse, damit wir dich benachrichtigen können, sobald WayFable für dich bereit ist.</p>'
    || '<div style="text-align:center;margin:32px 0">'
    || '<a href="' || _confirm_url || '" style="display:inline-block;background:linear-gradient(135deg,#0EA5E9,#6366F1);color:#fff;text-decoration:none;padding:14px 40px;border-radius:50px;font-size:16px;font-weight:600">E-Mail bestätigen</a>'
    || '</div>'
    || '<p style="color:#94a3b8;font-size:13px;line-height:1.5;margin:24px 0 0">'
    || 'Falls du dich nicht für die Warteliste angemeldet hast, kannst du diese E-Mail ignorieren.</p>'
    || '</div>'
    || '<div style="padding:20px 32px;background:#f8fafc;text-align:center;border-top:1px solid #e2e8f0">'
    || '<p style="color:#94a3b8;font-size:12px;margin:0">© 2026 WayFable · wayfable.ch</p>'
    || '</div></div></body></html>';

  IF _url IS NOT NULL AND _secret IS NOT NULL THEN
    PERFORM net.http_post(
      url := _url || '/functions/v1/send-email',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || _secret,
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object(
        'to', NEW.email,
        'subject', 'Bestätige deine WayFable Wartelisten-Anmeldung',
        'html_body', _html
      )
    );
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_waitlist_send_confirmation
  AFTER INSERT ON public.waitlist
  FOR EACH ROW
  EXECUTE FUNCTION public.send_waitlist_confirmation_email();
