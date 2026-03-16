-- =============================================================================
-- Hard Paywall + 14-Day Premium Trial Migration
-- =============================================================================

-- 1. Add ai_credits_purchased column to track bought Inspirationen separately
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ai_credits_purchased INTEGER NOT NULL DEFAULT 0;

-- Backfill: existing free users who bought Inspirationen
UPDATE profiles
SET ai_credits_purchased = ai_credits_balance
WHERE subscription_tier = 'free'
  AND ai_credits_balance > 0;

-- Backfill: existing premium users — purchased credits = balance minus monthly quota
-- (conservative: if balance < quota, assume all are subscription credits → purchased = 0)
UPDATE profiles
SET ai_credits_purchased = GREATEST(0, ai_credits_balance - ai_credits_monthly_quota)
WHERE subscription_tier = 'premium'
  AND ai_credits_balance > 0;

-- 2. Update handle_new_user() — new signups get 14-day premium trial
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (
    id, email, first_name, last_name,
    subscription_tier, subscription_status, subscription_period_end,
    ai_credits_balance
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'first_name'), ''), NULL),
    COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'last_name'), ''), NULL),
    'premium',
    'trialing',
    NOW() + INTERVAL '14 days',
    20
  );
  RETURN NEW;
END;
$$;

-- 3. DB function to refund only purchased credits on subscription cancel/expiry
CREATE OR REPLACE FUNCTION reset_to_purchased_credits(profile_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles
  SET ai_credits_balance = ai_credits_purchased
  WHERE id = profile_id;
END;
$$;

-- 4. Add archived status for soft-deleted trips
-- (Only add to CHECK constraint if not already there)
DO $$
BEGIN
  -- Drop existing constraint and recreate with 'archived'
  ALTER TABLE trips DROP CONSTRAINT IF EXISTS trips_status_check;
  ALTER TABLE trips ADD CONSTRAINT trips_status_check
    CHECK (status IN ('planning', 'upcoming', 'active', 'completed', 'archived'));
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not update trips status constraint: %', SQLERRM;
END;
$$;

-- 5. Index for trial expiry cron job
CREATE INDEX IF NOT EXISTS idx_profiles_trial_expiry
  ON profiles (subscription_status, subscription_period_end)
  WHERE subscription_status = 'trialing';

-- 6. Index for trip cleanup cron job (free user trips past end date)
CREATE INDEX IF NOT EXISTS idx_trips_end_date_status
  ON trips (end_date, status)
  WHERE status != 'archived';

-- 7. pg_cron schedule for trial-expiry (daily at 08:00 UTC)
-- NOTE: Run this manually in SQL editor if pg_cron extension is not available in migrations:
-- SELECT cron.schedule(
--   'trial-expiry-daily',
--   '0 8 * * *',
--   $$SELECT net.http_post(
--     url := current_setting('app.settings.supabase_url') || '/functions/v1/trial-expiry',
--     headers := jsonb_build_object(
--       'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
--       'Content-Type', 'application/json'
--     ),
--     body := '{}'::jsonb
--   )$$
-- );
