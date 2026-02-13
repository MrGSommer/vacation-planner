-- Multi-User AI Chat: Shared trip messages + trip memory
-- Converts Fable from single-user to shared group chat per trip.
-- Individual encrypted message rows replace the blob approach.
-- Trip memory provides persistent per-trip knowledge from conversations.

-- ============================================================
-- 1. New tables
-- ============================================================

-- ai_trip_messages: individual encrypted message rows
CREATE TABLE IF NOT EXISTS ai_trip_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  sender_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  encrypted_content bytea NOT NULL,
  credits_cost int,
  credits_after int,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_trip_messages_trip_created
  ON ai_trip_messages(trip_id, created_at);

-- ai_trip_memory: encrypted trip knowledge
CREATE TABLE IF NOT EXISTS ai_trip_memory (
  trip_id uuid PRIMARY KEY REFERENCES trips(id) ON DELETE CASCADE,
  encrypted_memory bytea NOT NULL,
  updated_at timestamptz DEFAULT now()
);

-- ============================================================
-- 2. RLS policies
-- ============================================================

ALTER TABLE ai_trip_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Trip participants can view trip messages"
  ON ai_trip_messages FOR SELECT
  USING (is_trip_participant(trip_id));

CREATE POLICY "Users can insert their own messages"
  ON ai_trip_messages FOR INSERT
  WITH CHECK (sender_id = auth.uid());

CREATE POLICY "Trip participants can delete trip messages"
  ON ai_trip_messages FOR DELETE
  USING (is_trip_participant(trip_id));

ALTER TABLE ai_trip_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Trip participants can view trip memory"
  ON ai_trip_memory FOR SELECT
  USING (is_trip_participant(trip_id));

CREATE POLICY "Trip participants can insert trip memory"
  ON ai_trip_memory FOR INSERT
  WITH CHECK (is_trip_participant(trip_id));

CREATE POLICY "Trip participants can update trip memory"
  ON ai_trip_memory FOR UPDATE
  USING (is_trip_participant(trip_id));

CREATE POLICY "Trip participants can delete trip memory"
  ON ai_trip_memory FOR DELETE
  USING (is_trip_participant(trip_id));

-- ============================================================
-- 3. New RPCs for trip messages
-- ============================================================

-- Insert a single encrypted message
CREATE OR REPLACE FUNCTION insert_ai_trip_message(
  p_trip_id uuid,
  p_sender_id uuid,
  p_sender_name text,
  p_role text,
  p_content text,
  p_credits_cost int DEFAULT NULL,
  p_credits_after int DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_key text;
  v_id uuid;
BEGIN
  SELECT get_ai_encryption_key() INTO v_key;
  INSERT INTO public.ai_trip_messages (trip_id, sender_id, sender_name, role, encrypted_content, credits_cost, credits_after)
  VALUES (
    p_trip_id,
    p_sender_id,
    p_sender_name,
    p_role,
    extensions.pgp_sym_encrypt(p_content, v_key),
    p_credits_cost,
    p_credits_after
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Get all messages for a trip (decrypted)
CREATE OR REPLACE FUNCTION get_ai_trip_messages(p_trip_id uuid)
RETURNS TABLE(id uuid, sender_id uuid, sender_name text, role text, decrypted_content text, credits_cost int, credits_after int, created_at timestamptz)
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
      m.id,
      m.sender_id,
      m.sender_name,
      m.role,
      extensions.pgp_sym_decrypt(m.encrypted_content, v_key) AS decrypted_content,
      m.credits_cost,
      m.credits_after,
      m.created_at
    FROM public.ai_trip_messages m
    WHERE m.trip_id = p_trip_id
    ORDER BY m.created_at ASC;
END;
$$;

-- Delete all messages for a trip
CREATE OR REPLACE FUNCTION delete_ai_trip_messages(p_trip_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.ai_trip_messages WHERE trip_id = p_trip_id;
END;
$$;

-- ============================================================
-- 4. New RPCs for trip memory
-- ============================================================

-- Upsert encrypted trip memory
CREATE OR REPLACE FUNCTION save_ai_trip_memory(p_trip_id uuid, p_memory_text text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_key text;
BEGIN
  SELECT get_ai_encryption_key() INTO v_key;
  INSERT INTO public.ai_trip_memory (trip_id, encrypted_memory, updated_at)
  VALUES (
    p_trip_id,
    extensions.pgp_sym_encrypt(p_memory_text, v_key),
    now()
  )
  ON CONFLICT (trip_id) DO UPDATE SET
    encrypted_memory = EXCLUDED.encrypted_memory,
    updated_at = now();
END;
$$;

-- Get decrypted trip memory
CREATE OR REPLACE FUNCTION get_ai_trip_memory(p_trip_id uuid)
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
    FROM public.ai_trip_memory m
    WHERE m.trip_id = p_trip_id;
END;
$$;

-- Delete trip memory
CREATE OR REPLACE FUNCTION delete_ai_trip_memory(p_trip_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.ai_trip_memory WHERE trip_id = p_trip_id;
END;
$$;

-- ============================================================
-- 5. Update existing RPCs
-- ============================================================

-- get_ai_conversation: remove user_id filter so all trip participants see the same state
DROP FUNCTION IF EXISTS get_ai_conversation(uuid);
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
    WHERE c.trip_id = p_trip_id;
END;
$$;

-- delete_ai_conversation: remove user_id filter + cascade to trip messages and memory
DROP FUNCTION IF EXISTS delete_ai_conversation(uuid);
CREATE OR REPLACE FUNCTION delete_ai_conversation(p_trip_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.ai_conversations WHERE trip_id = p_trip_id;
  DELETE FROM public.ai_trip_messages WHERE trip_id = p_trip_id;
  DELETE FROM public.ai_trip_memory WHERE trip_id = p_trip_id;
END;
$$;
