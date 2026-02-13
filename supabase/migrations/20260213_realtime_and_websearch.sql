-- 1a. Enable Realtime on ai_trip_messages
ALTER PUBLICATION supabase_realtime ADD TABLE ai_trip_messages;

-- 1b. Processing lock columns on ai_conversations
ALTER TABLE ai_conversations
  ADD COLUMN IF NOT EXISTS processing_user_id uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS processing_user_name text,
  ADD COLUMN IF NOT EXISTS processing_started_at timestamptz;

-- 1c. Lock RPCs

-- Acquire processing lock (returns true if acquired)
CREATE OR REPLACE FUNCTION acquire_ai_processing_lock(
  p_trip_id uuid,
  p_user_id uuid,
  p_user_name text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_user_id uuid;
  v_started_at timestamptz;
BEGIN
  -- Row-level lock
  SELECT processing_user_id, processing_started_at
    INTO v_current_user_id, v_started_at
    FROM ai_conversations
    WHERE trip_id = p_trip_id
    FOR UPDATE;

  -- No conversation row exists
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- No current lock, or lock is stale (> 60s), or same user re-acquiring
  IF v_current_user_id IS NULL
     OR v_current_user_id = p_user_id
     OR (v_started_at IS NOT NULL AND v_started_at < now() - interval '60 seconds')
  THEN
    UPDATE ai_conversations
      SET processing_user_id = p_user_id,
          processing_user_name = p_user_name,
          processing_started_at = now()
      WHERE trip_id = p_trip_id;
    RETURN true;
  END IF;

  -- Another user holds a fresh lock
  RETURN false;
END;
$$;

-- Release processing lock
CREATE OR REPLACE FUNCTION release_ai_processing_lock(p_trip_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE ai_conversations
    SET processing_user_id = NULL,
        processing_user_name = NULL,
        processing_started_at = NULL
    WHERE trip_id = p_trip_id;
END;
$$;

-- Get current processing lock state
CREATE OR REPLACE FUNCTION get_ai_processing_lock(p_trip_id uuid)
RETURNS TABLE(processing_user_id uuid, processing_user_name text, processing_started_at timestamptz)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT processing_user_id, processing_user_name, processing_started_at
    FROM ai_conversations
    WHERE trip_id = p_trip_id;
$$;

-- 1d. Data snapshot column
ALTER TABLE ai_conversations
  ADD COLUMN IF NOT EXISTS data_snapshot jsonb;

-- 1e. Web search usage logging — update task_type CHECK constraint
ALTER TABLE ai_usage_logs DROP CONSTRAINT IF EXISTS ai_usage_logs_task_type_check;
ALTER TABLE ai_usage_logs ADD CONSTRAINT ai_usage_logs_task_type_check
  CHECK (task_type IN ('conversation', 'plan_generation', 'plan_activities', 'agent_packing', 'agent_budget', 'agent_day_plan', 'web_search'));
