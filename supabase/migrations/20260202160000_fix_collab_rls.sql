-- Allow users to insert themselves as collaborator (for accepting invites)
-- and allow editors to update trips

-- Fix: allow self-insert into trip_collaborators when accepting an invite
DROP POLICY IF EXISTS "Owner can insert collaborators" ON trip_collaborators;
CREATE POLICY "Can insert collaborators" ON trip_collaborators FOR INSERT
  WITH CHECK (
    is_trip_owner(trip_id)
    OR (user_id = auth.uid() AND EXISTS (
      SELECT 1 FROM trip_invitations
      WHERE trip_id = trip_collaborators.trip_id
        AND status = 'pending'
    ))
  );

-- Allow editors to update trips (not just owner)
DROP POLICY IF EXISTS "Owner can update trips" ON trips;
CREATE POLICY "Participants can update trips" ON trips FOR UPDATE
  USING (
    owner_id = auth.uid()
    OR id IN (
      SELECT trip_id FROM trip_collaborators
      WHERE user_id = auth.uid() AND role IN ('owner', 'editor')
    )
  );

-- Allow accepting user to update invitation status
DROP POLICY IF EXISTS "Invitee can update invitation" ON trip_invitations;
CREATE POLICY "Invitee can update invitation" ON trip_invitations FOR UPDATE
  USING (true)
  WITH CHECK (status = 'accepted');

-- Allow anyone authenticated to read invitations by token (for accept flow)
DROP POLICY IF EXISTS "Invitations readable by token" ON trip_invitations;
CREATE POLICY "Invitations readable by token" ON trip_invitations FOR SELECT
  USING (
    invited_by = auth.uid()
    OR auth.uid() IS NOT NULL
  );
