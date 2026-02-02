-- Fix trip_stops RLS: use is_trip_participant which includes owner check
DROP POLICY IF EXISTS "Users can manage stops for their trips" ON trip_stops;
CREATE POLICY "Users can manage stops for their trips" ON trip_stops
  FOR ALL USING (is_trip_participant(trip_id));

-- Fix trip_invitations SELECT: restrict to trip owner/collaborators or the invited user
DROP POLICY IF EXISTS "Invitations readable by token" ON trip_invitations;
CREATE POLICY "Invitations readable by token" ON trip_invitations FOR SELECT
  USING (
    invited_by = auth.uid()
    OR is_trip_participant(trip_id)
    OR invited_email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );
