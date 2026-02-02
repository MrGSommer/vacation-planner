-- Ensure clean INSERT policy on trip_invitations
-- Drop all possible INSERT policies that might exist
DROP POLICY IF EXISTS "Owner can create invitations" ON trip_invitations;
DROP POLICY IF EXISTS "Participants can create invitations" ON trip_invitations;

-- Create a simple INSERT policy: any authenticated user who is a trip participant can create invitations
-- is_trip_participant is SECURITY DEFINER and bypasses RLS
CREATE POLICY "Participants can create invitations" ON trip_invitations
  FOR INSERT TO authenticated
  WITH CHECK (is_trip_participant(trip_id));

-- Also ensure there's a DELETE policy for cleanup
DROP POLICY IF EXISTS "Participants can delete invitations" ON trip_invitations;
CREATE POLICY "Participants can delete invitations" ON trip_invitations
  FOR DELETE USING (is_trip_participant(trip_id));
