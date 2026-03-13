-- Drop ai_user_memory table and related RPC functions
-- User preferences are now stored directly in profiles.ai_custom_instruction

DROP FUNCTION IF EXISTS get_ai_user_memory();
DROP FUNCTION IF EXISTS save_ai_user_memory(text);
DROP FUNCTION IF EXISTS delete_ai_user_memory();
DROP TABLE IF EXISTS ai_user_memory CASCADE;
