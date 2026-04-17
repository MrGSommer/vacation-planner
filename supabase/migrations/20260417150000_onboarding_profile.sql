-- Add onboarding columns to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarding_dismissed BOOLEAN DEFAULT false;

-- Existing users with ai_custom_instruction set: mark as completed
UPDATE profiles
SET onboarding_completed = true
WHERE ai_custom_instruction IS NOT NULL AND ai_custom_instruction != '';

-- All other existing users: set dismissed so they don't get auto-redirected
-- They'll see a subtle profile button instead
UPDATE profiles
SET onboarding_dismissed = true
WHERE onboarding_completed = false
  AND created_at < NOW();

-- Raise ai_custom_instruction limit from 500 to 2000 (onboarding memories need more space)
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_ai_custom_instruction_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_ai_custom_instruction_check
  CHECK (ai_custom_instruction IS NULL OR length(ai_custom_instruction) <= 2000);

-- Add 'onboarding' to ai_usage_logs task_type CHECK constraint
ALTER TABLE ai_usage_logs DROP CONSTRAINT IF EXISTS ai_usage_logs_task_type_check;
ALTER TABLE ai_usage_logs ADD CONSTRAINT ai_usage_logs_task_type_check
  CHECK (task_type IN ('conversation', 'plan_generation', 'plan_activities', 'agent_packing', 'agent_budget', 'agent_day_plan', 'web_search', 'receipt_scan', 'packing_import', 'onboarding'));
