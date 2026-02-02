-- Add user preference columns to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS preferred_language TEXT NOT NULL DEFAULT 'de';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS preferred_currency TEXT NOT NULL DEFAULT 'CHF';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notifications_enabled BOOLEAN NOT NULL DEFAULT true;
