-- =============================================================================
-- Trial Opt-In: New users start as Free, trial activated via RPC
-- =============================================================================

-- 1. Update handle_new_user() — new signups start as FREE (no trial)
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (
    id, email, first_name, last_name,
    subscription_tier, subscription_status,
    ai_credits_balance
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'first_name'), ''), NULL),
    COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'last_name'), ''), NULL),
    'free',
    'active',
    0
  );
  RETURN NEW;
END;
$$;

-- 2. RPC: activate_free_trial() — one-time 14-day premium trial
CREATE OR REPLACE FUNCTION activate_free_trial()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  -- Only for users who never had a trial (subscription_period_end IS NULL)
  UPDATE profiles
  SET subscription_tier = 'premium',
      subscription_status = 'trialing',
      subscription_period_end = NOW() + INTERVAL '14 days',
      ai_credits_balance = COALESCE(ai_credits_balance, 0) + 20
  WHERE id = v_user_id
    AND subscription_tier = 'free'
    AND subscription_status != 'trialing'
    AND subscription_period_end IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'Trial bereits verwendet oder nicht berechtigt');
  END IF;

  RETURN jsonb_build_object('success', true, 'trial_ends_at', (NOW() + INTERVAL '14 days')::text);
END;
$$;
