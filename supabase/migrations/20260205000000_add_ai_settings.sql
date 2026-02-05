-- Add AI settings to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ai_trip_context_enabled boolean DEFAULT true;
