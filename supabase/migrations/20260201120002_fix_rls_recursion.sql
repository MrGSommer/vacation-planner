-- Fix: Break the circular RLS dependency between trips and trip_collaborators
-- Solution: Use a SECURITY DEFINER function to bypass RLS when checking participation

-- Drop all problematic policies
DROP POLICY IF EXISTS "Trips visible to participants" ON trips;
DROP POLICY IF EXISTS "Collaborators visible to own" ON trip_collaborators;
DROP POLICY IF EXISTS "Collaborators visible to trip owner" ON trip_collaborators;
DROP POLICY IF EXISTS "Owner can insert collaborators" ON trip_collaborators;
DROP POLICY IF EXISTS "Owner can update collaborators" ON trip_collaborators;
DROP POLICY IF EXISTS "Owner can delete collaborators" ON trip_collaborators;
DROP POLICY IF EXISTS "Collaborators visible to participants" ON trip_collaborators;
DROP POLICY IF EXISTS "Owner can manage collaborators" ON trip_collaborators;

-- Helper: check if user is collaborator (bypasses RLS)
CREATE OR REPLACE FUNCTION is_trip_collaborator(tid UUID) RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM trip_collaborators WHERE trip_id = tid AND user_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- Helper: check if user is trip owner (bypasses RLS)
CREATE OR REPLACE FUNCTION is_trip_owner(tid UUID) RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM trips WHERE id = tid AND owner_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- Trips: use SECURITY DEFINER function to avoid recursion
CREATE POLICY "Trips visible to participants" ON trips FOR SELECT
  USING (owner_id = auth.uid() OR is_trip_collaborator(id));

-- Trip collaborators: use SECURITY DEFINER function
CREATE POLICY "Collaborators visible" ON trip_collaborators FOR SELECT
  USING (user_id = auth.uid() OR is_trip_owner(trip_id));

CREATE POLICY "Owner can insert collaborators" ON trip_collaborators FOR INSERT
  WITH CHECK (is_trip_owner(trip_id));

CREATE POLICY "Owner can update collaborators" ON trip_collaborators FOR UPDATE
  USING (is_trip_owner(trip_id));

CREATE POLICY "Owner can delete collaborators" ON trip_collaborators FOR DELETE
  USING (is_trip_owner(trip_id));

-- Also update is_trip_participant to use the new helpers
CREATE OR REPLACE FUNCTION is_trip_participant(tid UUID) RETURNS BOOLEAN AS $$
  SELECT is_trip_owner(tid) OR is_trip_collaborator(tid);
$$ LANGUAGE sql SECURITY DEFINER;
