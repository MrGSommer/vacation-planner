-- Phased Plan Generation + Conversation Persistence + User Memory
-- Includes pgcrypto encryption via Vault for nDSG/GDPR compliance

-- Enable pgcrypto (already installed, but ensure)
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Store encryption key in Vault
SELECT vault.create_secret(
  encode(gen_random_bytes(32), 'hex'),
  'ai_encryption_key',
  'Encryption key for AI conversation and memory data'
);

-- Helper to retrieve encryption key (SECURITY DEFINER = runs as owner, key never exposed to client)
CREATE OR REPLACE FUNCTION get_ai_encryption_key()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'ai_encryption_key' LIMIT 1;
$$;

-- AI Conversations table (one per trip)
CREATE TABLE IF NOT EXISTS ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  phase text NOT NULL CHECK (phase IN ('conversing', 'generating_plan', 'plan_review')),
  encrypted_data bytea NOT NULL,
  context_snapshot jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (trip_id)
);

-- AI User Memory table (one per user)
CREATE TABLE IF NOT EXISTS ai_user_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  encrypted_memory bytea NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (user_id)
);

-- RLS for ai_conversations
ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view conversations for trips they participate in"
  ON ai_conversations FOR SELECT
  USING (is_trip_participant(trip_id));

CREATE POLICY "Users can insert their own conversations"
  ON ai_conversations FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own conversations"
  ON ai_conversations FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own conversations"
  ON ai_conversations FOR DELETE
  USING (user_id = auth.uid());

-- RLS for ai_user_memory
ALTER TABLE ai_user_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own memory"
  ON ai_user_memory FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own memory"
  ON ai_user_memory FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own memory"
  ON ai_user_memory FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own memory"
  ON ai_user_memory FOR DELETE
  USING (user_id = auth.uid());

-- RPC: Save AI Conversation (upsert, encrypted)
CREATE OR REPLACE FUNCTION save_ai_conversation(
  p_trip_id uuid,
  p_user_id uuid,
  p_phase text,
  p_data text,
  p_context jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_key text;
BEGIN
  SELECT get_ai_encryption_key() INTO v_key;
  INSERT INTO public.ai_conversations (trip_id, user_id, phase, encrypted_data, context_snapshot, updated_at)
  VALUES (
    p_trip_id,
    p_user_id,
    p_phase,
    extensions.pgp_sym_encrypt(p_data, v_key),
    p_context,
    now()
  )
  ON CONFLICT (trip_id) DO UPDATE SET
    phase = EXCLUDED.phase,
    encrypted_data = EXCLUDED.encrypted_data,
    context_snapshot = EXCLUDED.context_snapshot,
    updated_at = now();
END;
$$;

-- RPC: Get AI Conversation (decrypted)
CREATE OR REPLACE FUNCTION get_ai_conversation(p_trip_id uuid)
RETURNS TABLE(trip_id uuid, user_id uuid, phase text, decrypted_data text, context_snapshot jsonb, updated_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_key text;
BEGIN
  SELECT get_ai_encryption_key() INTO v_key;
  RETURN QUERY
    SELECT
      c.trip_id,
      c.user_id,
      c.phase,
      extensions.pgp_sym_decrypt(c.encrypted_data, v_key) AS decrypted_data,
      c.context_snapshot,
      c.updated_at
    FROM public.ai_conversations c
    WHERE c.trip_id = p_trip_id AND c.user_id = auth.uid();
END;
$$;

-- RPC: Delete AI Conversation
CREATE OR REPLACE FUNCTION delete_ai_conversation(p_trip_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.ai_conversations WHERE trip_id = p_trip_id AND user_id = auth.uid();
END;
$$;

-- RPC: Save AI User Memory (upsert, encrypted)
CREATE OR REPLACE FUNCTION save_ai_user_memory(p_memory_text text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_key text;
BEGIN
  SELECT get_ai_encryption_key() INTO v_key;
  INSERT INTO public.ai_user_memory (user_id, encrypted_memory, updated_at)
  VALUES (
    auth.uid(),
    extensions.pgp_sym_encrypt(p_memory_text, v_key),
    now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    encrypted_memory = EXCLUDED.encrypted_memory,
    updated_at = now();
END;
$$;

-- RPC: Get AI User Memory (decrypted)
CREATE OR REPLACE FUNCTION get_ai_user_memory()
RETURNS TABLE(decrypted_memory text, updated_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_key text;
BEGIN
  SELECT get_ai_encryption_key() INTO v_key;
  RETURN QUERY
    SELECT
      extensions.pgp_sym_decrypt(m.encrypted_memory, v_key) AS decrypted_memory,
      m.updated_at
    FROM public.ai_user_memory m
    WHERE m.user_id = auth.uid();
END;
$$;

-- RPC: Delete AI User Memory
CREATE OR REPLACE FUNCTION delete_ai_user_memory()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.ai_user_memory WHERE user_id = auth.uid();
END;
$$;

-- Update ai_usage_logs CHECK constraint to include plan_activities
ALTER TABLE ai_usage_logs DROP CONSTRAINT IF EXISTS ai_usage_logs_task_type_check;
ALTER TABLE ai_usage_logs ADD CONSTRAINT ai_usage_logs_task_type_check
  CHECK (task_type IN ('conversation', 'plan_generation', 'plan_activities'));

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_ai_conversations_user_id ON ai_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_trip_id ON ai_conversations(trip_id);
CREATE INDEX IF NOT EXISTS idx_ai_user_memory_user_id ON ai_user_memory(user_id);
