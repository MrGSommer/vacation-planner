-- Helper: check if user is owner OR editor collaborator
CREATE OR REPLACE FUNCTION is_trip_editor(tid UUID) RETURNS BOOLEAN AS $$
  SELECT is_trip_owner(tid) OR EXISTS (
    SELECT 1 FROM trip_collaborators
    WHERE trip_id = tid AND user_id = auth.uid() AND role = 'editor'
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- ============================================================
-- trip_stops: replace ALL with SELECT + editor-only writes
-- ============================================================
DROP POLICY IF EXISTS "Users can manage stops for their trips" ON trip_stops;

CREATE POLICY "Stops visible to participants" ON trip_stops FOR SELECT
  USING (is_trip_participant(trip_id));

CREATE POLICY "Editors can insert stops" ON trip_stops FOR INSERT
  WITH CHECK (is_trip_editor(trip_id));

CREATE POLICY "Editors can update stops" ON trip_stops FOR UPDATE
  USING (is_trip_editor(trip_id));

CREATE POLICY "Editors can delete stops" ON trip_stops FOR DELETE
  USING (is_trip_editor(trip_id));

-- ============================================================
-- itinerary_days: keep ALL for manage (days are structural),
-- but split so viewers can still read
-- ============================================================
DROP POLICY IF EXISTS "Participants can manage days" ON itinerary_days;
DROP POLICY IF EXISTS "Days visible to participants" ON itinerary_days;

CREATE POLICY "Days visible to participants" ON itinerary_days FOR SELECT
  USING (is_trip_participant(trip_id));

CREATE POLICY "Editors can insert days" ON itinerary_days FOR INSERT
  WITH CHECK (is_trip_editor(trip_id));

CREATE POLICY "Editors can update days" ON itinerary_days FOR UPDATE
  USING (is_trip_editor(trip_id));

CREATE POLICY "Editors can delete days" ON itinerary_days FOR DELETE
  USING (is_trip_editor(trip_id));

-- ============================================================
-- activities: viewers can read, editors can write
-- ============================================================
DROP POLICY IF EXISTS "Participants can manage activities" ON activities;
-- Keep existing SELECT policy "Activities visible to participants"

CREATE POLICY "Editors can insert activities" ON activities FOR INSERT
  WITH CHECK (is_trip_editor(trip_id));

CREATE POLICY "Editors can update activities" ON activities FOR UPDATE
  USING (is_trip_editor(trip_id));

CREATE POLICY "Editors can delete activities" ON activities FOR DELETE
  USING (is_trip_editor(trip_id));

-- ============================================================
-- photos: viewers can read, editors can write
-- ============================================================
DROP POLICY IF EXISTS "Participants can manage photos" ON photos;
-- Keep existing SELECT policy "Photos visible to participants"

CREATE POLICY "Editors can insert photos" ON photos FOR INSERT
  WITH CHECK (is_trip_editor(trip_id));

CREATE POLICY "Editors can update photos" ON photos FOR UPDATE
  USING (is_trip_editor(trip_id));

CREATE POLICY "Editors can delete photos" ON photos FOR DELETE
  USING (is_trip_editor(trip_id));

-- ============================================================
-- budget_categories: viewers can read, editors can write
-- ============================================================
DROP POLICY IF EXISTS "Participants can manage budget cats" ON budget_categories;
-- Keep existing SELECT policy "Budget cats visible to participants"

CREATE POLICY "Editors can insert budget cats" ON budget_categories FOR INSERT
  WITH CHECK (is_trip_editor(trip_id));

CREATE POLICY "Editors can update budget cats" ON budget_categories FOR UPDATE
  USING (is_trip_editor(trip_id));

CREATE POLICY "Editors can delete budget cats" ON budget_categories FOR DELETE
  USING (is_trip_editor(trip_id));

-- ============================================================
-- expenses: viewers can read, editors can write
-- ============================================================
DROP POLICY IF EXISTS "Participants can manage expenses" ON expenses;
-- Keep existing SELECT policy "Expenses visible to participants"

CREATE POLICY "Editors can insert expenses" ON expenses FOR INSERT
  WITH CHECK (is_trip_editor(trip_id));

CREATE POLICY "Editors can update expenses" ON expenses FOR UPDATE
  USING (is_trip_editor(trip_id));

CREATE POLICY "Editors can delete expenses" ON expenses FOR DELETE
  USING (is_trip_editor(trip_id));

-- ============================================================
-- packing_lists: viewers can read, editors can write
-- ============================================================
DROP POLICY IF EXISTS "Participants can manage packing lists" ON packing_lists;
-- Keep existing SELECT policy "Packing lists visible to participants"

CREATE POLICY "Editors can insert packing lists" ON packing_lists FOR INSERT
  WITH CHECK (is_trip_editor(trip_id));

CREATE POLICY "Editors can update packing lists" ON packing_lists FOR UPDATE
  USING (is_trip_editor(trip_id));

CREATE POLICY "Editors can delete packing lists" ON packing_lists FOR DELETE
  USING (is_trip_editor(trip_id));

-- ============================================================
-- packing_items: viewers can read, editors can write
-- ============================================================
DROP POLICY IF EXISTS "Participants can manage packing items" ON packing_items;
-- Keep existing SELECT policy "Packing items visible"

CREATE POLICY "Editors can insert packing items" ON packing_items FOR INSERT
  WITH CHECK (list_id IN (SELECT id FROM packing_lists WHERE is_trip_editor(trip_id)));

CREATE POLICY "Editors can update packing items" ON packing_items FOR UPDATE
  USING (list_id IN (SELECT id FROM packing_lists WHERE is_trip_editor(trip_id)));

CREATE POLICY "Editors can delete packing items" ON packing_items FOR DELETE
  USING (list_id IN (SELECT id FROM packing_lists WHERE is_trip_editor(trip_id)));

-- ============================================================
-- trip_invitations: only editors/owners can create invitations
-- ============================================================
DROP POLICY IF EXISTS "Participants can create invitations" ON trip_invitations;

CREATE POLICY "Editors can create invitations" ON trip_invitations FOR INSERT TO authenticated
  WITH CHECK (invited_by = auth.uid() AND is_trip_editor(trip_id));

-- Delete invitations: only editors/owners
DROP POLICY IF EXISTS "Participants can delete invitations" ON trip_invitations;

CREATE POLICY "Editors can delete invitations" ON trip_invitations FOR DELETE
  USING (is_trip_editor(trip_id));
