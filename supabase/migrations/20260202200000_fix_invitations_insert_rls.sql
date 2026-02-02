-- Fix trip_invitations INSERT policy to use is_trip_participant (SECURITY DEFINER)
-- instead of a subquery on trips table which causes RLS recursion issues

DROP POLICY IF EXISTS "Owner can create invitations" ON trip_invitations;

CREATE POLICY "Participants can create invitations" ON trip_invitations
  FOR INSERT WITH CHECK (is_trip_participant(trip_id));
