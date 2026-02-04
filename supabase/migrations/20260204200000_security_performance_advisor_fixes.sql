-- ============================================================
-- Supabase Security & Performance Advisor Fixes
-- ============================================================
-- Fixes:
--   SECURITY: function_search_path_mutable (6 functions)
--   SECURITY: rls_policy_always_true (trip_invitations UPDATE)
--   SECURITY: trip_collaborators INSERT policy too permissive
--   PERFORMANCE: auth_rls_initplan (9 RLS policies)
--   PERFORMANCE: unindexed_foreign_keys (8 missing indexes)
--   PERFORMANCE: unused_index (1 redundant index)
-- ============================================================

-- ============================================================
-- 1. SECURITY: Fix SECURITY DEFINER functions missing search_path
--    All functions recreated with SET search_path = ''
--    and fully-qualified table references.
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_trip_collaborator(tid UUID) RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.trip_collaborators WHERE trip_id = tid AND user_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE FUNCTION public.is_trip_owner(tid UUID) RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.trips WHERE id = tid AND owner_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE FUNCTION public.is_trip_participant(tid UUID) RETURNS BOOLEAN AS $$
  SELECT public.is_trip_owner(tid) OR public.is_trip_collaborator(tid);
$$ LANGUAGE sql SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE FUNCTION public.is_trip_editor(tid UUID) RETURNS BOOLEAN AS $$
  SELECT public.is_trip_owner(tid) OR EXISTS (
    SELECT 1 FROM public.trip_collaborators
    WHERE trip_id = tid AND user_id = auth.uid() AND role = 'editor'
  );
$$ LANGUAGE sql SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE FUNCTION public.lookup_invite(invite_token UUID)
RETURNS JSON AS $$
DECLARE
  inv RECORD;
  trp RECORD;
BEGIN
  SELECT * INTO inv FROM public.trip_invitations WHERE token = invite_token;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT id, name, destination, start_date, end_date INTO trp FROM public.trips WHERE id = inv.trip_id;
  RETURN json_build_object(
    'invitation', json_build_object(
      'id', inv.id, 'trip_id', inv.trip_id, 'role', inv.role,
      'status', inv.status, 'type', inv.type, 'token', inv.token
    ),
    'trip', json_build_object(
      'id', trp.id, 'name', trp.name, 'destination', trp.destination,
      'start_date', trp.start_date, 'end_date', trp.end_date
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE FUNCTION public.accept_invite(invite_token UUID)
RETURNS JSON AS $$
DECLARE
  inv RECORD;
  uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RETURN json_build_object('error', 'Nicht eingeloggt');
  END IF;

  SELECT * INTO inv FROM public.trip_invitations WHERE token = invite_token;
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Einladung nicht gefunden');
  END IF;

  IF inv.status != 'pending' THEN
    RETURN json_build_object('error', 'Einladung wurde bereits verwendet');
  END IF;

  IF inv.type != 'collaborate' THEN
    RETURN json_build_object('error', 'Dieser Link ist kein Einladungslink');
  END IF;

  INSERT INTO public.trip_collaborators (trip_id, user_id, role)
    VALUES (inv.trip_id, uid, inv.role)
    ON CONFLICT (trip_id, user_id) DO NOTHING;

  UPDATE public.trip_invitations SET status = 'accepted' WHERE id = inv.id;

  RETURN json_build_object('success', true, 'trip_id', inv.trip_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- ============================================================
-- 2. SECURITY: Fix trip_invitations UPDATE policy (USING true)
--    Only the invitee (by email) or the inviter can update.
--    Token-only invitations use accept_invite() which bypasses RLS.
-- ============================================================

DROP POLICY IF EXISTS "Invitee can update invitation" ON trip_invitations;
CREATE POLICY "Invitee can update invitation" ON trip_invitations FOR UPDATE
  USING (
    invited_by = (select auth.uid())
    OR invited_email = (SELECT email FROM public.profiles WHERE id = (select auth.uid()))
  )
  WITH CHECK (status IN ('accepted', 'declined'));

-- ============================================================
-- 3. SECURITY: Fix trip_collaborators INSERT policy
--    Require that the pending invitation is addressed to the current user.
-- ============================================================

DROP POLICY IF EXISTS "Can insert collaborators" ON trip_collaborators;
CREATE POLICY "Can insert collaborators" ON trip_collaborators FOR INSERT
  WITH CHECK (
    is_trip_owner(trip_id)
    OR (
      user_id = (select auth.uid())
      AND EXISTS (
        SELECT 1 FROM public.trip_invitations
        WHERE trip_id = trip_collaborators.trip_id
          AND status = 'pending'
          AND invited_email = (SELECT email FROM public.profiles WHERE id = (select auth.uid()))
      )
    )
  );

-- ============================================================
-- 4. PERFORMANCE: Fix auth_rls_initplan issues
--    Replace auth.uid() with (select auth.uid()) in all affected policies
--    so the value is computed once per query instead of per row.
-- ============================================================

-- profiles: "Users can update own profile"
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE
  USING ((select auth.uid()) = id);

-- trips: "Owner can insert trips"
DROP POLICY IF EXISTS "Owner can insert trips" ON trips;
CREATE POLICY "Owner can insert trips" ON trips FOR INSERT
  WITH CHECK (owner_id = (select auth.uid()));

-- trips: "Owner can delete trips"
DROP POLICY IF EXISTS "Owner can delete trips" ON trips;
CREATE POLICY "Owner can delete trips" ON trips FOR DELETE
  USING (owner_id = (select auth.uid()));

-- trips: "Trips visible to participants"
DROP POLICY IF EXISTS "Trips visible to participants" ON trips;
CREATE POLICY "Trips visible to participants" ON trips FOR SELECT
  USING (owner_id = (select auth.uid()) OR is_trip_collaborator(id));

-- trips: "Participants can update trips"
DROP POLICY IF EXISTS "Participants can update trips" ON trips;
CREATE POLICY "Participants can update trips" ON trips FOR UPDATE
  USING (
    owner_id = (select auth.uid())
    OR id IN (
      SELECT trip_id FROM public.trip_collaborators
      WHERE user_id = (select auth.uid()) AND role IN ('owner', 'editor')
    )
  );

-- trip_collaborators: "Collaborators visible"
DROP POLICY IF EXISTS "Collaborators visible" ON trip_collaborators;
CREATE POLICY "Collaborators visible" ON trip_collaborators FOR SELECT
  USING (user_id = (select auth.uid()) OR is_trip_owner(trip_id));

-- trip_invitations: "Invitations readable"
DROP POLICY IF EXISTS "Invitations readable" ON trip_invitations;
CREATE POLICY "Invitations readable" ON trip_invitations FOR SELECT
  USING (
    invited_by = (select auth.uid())
    OR is_trip_participant(trip_id)
    OR invited_email = (SELECT email FROM public.profiles WHERE id = (select auth.uid()))
  );

-- trip_invitations: "Editors can create invitations"
DROP POLICY IF EXISTS "Editors can create invitations" ON trip_invitations;
CREATE POLICY "Editors can create invitations" ON trip_invitations FOR INSERT TO authenticated
  WITH CHECK (invited_by = (select auth.uid()) AND is_trip_editor(trip_id));

-- ============================================================
-- 5. PERFORMANCE: Add missing foreign key indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_expenses_category_id ON public.expenses (category_id);
CREATE INDEX IF NOT EXISTS idx_expenses_user_id ON public.expenses (user_id);
CREATE INDEX IF NOT EXISTS idx_photos_day_id ON public.photos (day_id);
CREATE INDEX IF NOT EXISTS idx_photos_user_id ON public.photos (user_id);
CREATE INDEX IF NOT EXISTS idx_trip_collaborators_user_id ON public.trip_collaborators (user_id);
CREATE INDEX IF NOT EXISTS idx_trip_invitations_invited_by ON public.trip_invitations (invited_by);
CREATE INDEX IF NOT EXISTS idx_trip_invitations_trip_id ON public.trip_invitations (trip_id);
CREATE INDEX IF NOT EXISTS idx_trips_owner_id ON public.trips (owner_id);

-- ============================================================
-- 6. PERFORMANCE: Drop redundant unused index
--    idx_trip_collaborators_trip_id is redundant with the
--    UNIQUE constraint on (trip_id, user_id) which covers
--    trip_id-only lookups.
-- ============================================================

DROP INDEX IF EXISTS public.idx_trip_collaborators_trip_id;
