-- Fix: use SECURITY DEFINER helper functions directly in WITH CHECK
-- to avoid RLS recursion when checking trip membership
DROP POLICY IF EXISTS "Participants can create invitations" ON trip_invitations;

CREATE POLICY "Participants can create invitations" ON trip_invitations
  FOR INSERT TO authenticated
  WITH CHECK (
    invited_by = auth.uid()
    AND (is_trip_owner(trip_id) OR is_trip_collaborator(trip_id))
  );
