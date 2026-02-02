-- Fix: The SELECT policies on trip_invitations reference auth.users which the
-- authenticated role cannot access, causing "permission denied for table users"
-- even on INSERT (because PostgREST evaluates SELECT policies for RETURNING).

-- Drop all existing SELECT policies
DROP POLICY IF EXISTS "Invitations visible to involved" ON trip_invitations;
DROP POLICY IF EXISTS "Invitations readable by token" ON trip_invitations;

-- Single clean SELECT policy: use profiles table (not auth.users) and is_trip_participant
CREATE POLICY "Invitations readable" ON trip_invitations FOR SELECT
  USING (
    invited_by = auth.uid()
    OR is_trip_participant(trip_id)
    OR invited_email = (SELECT email FROM profiles WHERE id = auth.uid())
  );
