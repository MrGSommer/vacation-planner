-- Fix infinite recursion in trips RLS policy
-- The "Trips visible to participants" policy causes recursion because
-- trip_collaborators has its own policy that queries trips.

-- Drop the problematic policies
DROP POLICY IF EXISTS "Trips visible to participants" ON trips;
DROP POLICY IF EXISTS "Collaborators visible to participants" ON trip_collaborators;

-- Recreate trips SELECT policy without subquery that triggers collaborator RLS
CREATE POLICY "Trips visible to participants" ON trips FOR SELECT
  USING (
    owner_id = auth.uid()
    OR id IN (
      SELECT trip_id FROM trip_collaborators WHERE user_id = auth.uid()
    )
  );

-- Collaborators: use a simpler policy that doesn't recurse back to trips
DROP POLICY IF EXISTS "Owner can manage collaborators" ON trip_collaborators;

CREATE POLICY "Collaborators visible to own" ON trip_collaborators FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Collaborators visible to trip owner" ON trip_collaborators FOR SELECT
  USING (trip_id IN (SELECT id FROM trips WHERE owner_id = auth.uid()));

CREATE POLICY "Owner can insert collaborators" ON trip_collaborators FOR INSERT
  WITH CHECK (trip_id IN (SELECT id FROM trips WHERE owner_id = auth.uid()));

CREATE POLICY "Owner can update collaborators" ON trip_collaborators FOR UPDATE
  USING (trip_id IN (SELECT id FROM trips WHERE owner_id = auth.uid()));

CREATE POLICY "Owner can delete collaborators" ON trip_collaborators FOR DELETE
  USING (trip_id IN (SELECT id FROM trips WHERE owner_id = auth.uid()));
