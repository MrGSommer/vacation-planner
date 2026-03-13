-- Atomic RPC functions for cascade operations, trip duplication, reactions, and receipt expenses.
-- All functions use SECURITY DEFINER to bypass RLS for internal cascade logic.

-- ============================================================
-- a) clear_trip_data_cascade
-- ============================================================

CREATE OR REPLACE FUNCTION clear_trip_data_cascade(
  p_trip_id UUID,
  p_options JSONB
)
RETURNS TEXT[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_photo_paths TEXT[] := '{}';
  v_activity_ids UUID[];
  v_list_ids UUID[];
BEGIN
  -- Activities (+ comments, reactions, documents that reference them)
  IF (p_options->>'activities')::boolean IS TRUE THEN
    SELECT array_agg(id) INTO v_activity_ids
      FROM public.activities WHERE trip_id = p_trip_id;

    IF v_activity_ids IS NOT NULL THEN
      DELETE FROM public.activity_comments WHERE activity_id = ANY(v_activity_ids);
      DELETE FROM public.activity_reactions WHERE activity_id = ANY(v_activity_ids);
      DELETE FROM public.activity_documents WHERE activity_id = ANY(v_activity_ids);
    END IF;

    DELETE FROM public.activities WHERE trip_id = p_trip_id;
    DELETE FROM public.itinerary_days WHERE trip_id = p_trip_id;
  END IF;

  -- Stops
  IF (p_options->>'stops')::boolean IS TRUE THEN
    DELETE FROM public.trip_stops WHERE trip_id = p_trip_id;
  END IF;

  -- Budget (expenses first, then categories + personal limits cascade via FK)
  IF (p_options->>'budget')::boolean IS TRUE THEN
    DELETE FROM public.expenses WHERE trip_id = p_trip_id;
    DELETE FROM public.budget_categories WHERE trip_id = p_trip_id;
  END IF;

  -- Packing (items via list lookup, then lists)
  IF (p_options->>'packing')::boolean IS TRUE THEN
    SELECT array_agg(id) INTO v_list_ids
      FROM public.packing_lists WHERE trip_id = p_trip_id;

    IF v_list_ids IS NOT NULL THEN
      DELETE FROM public.packing_items WHERE list_id = ANY(v_list_ids);
    END IF;

    DELETE FROM public.packing_lists WHERE trip_id = p_trip_id;
  END IF;

  -- Photos (collect storage_paths for client-side storage cleanup, then delete DB rows)
  IF (p_options->>'photos')::boolean IS TRUE THEN
    SELECT COALESCE(array_agg(storage_path), '{}') INTO v_photo_paths
      FROM public.photos
      WHERE trip_id = p_trip_id AND storage_path IS NOT NULL;

    DELETE FROM public.photos WHERE trip_id = p_trip_id;
  END IF;

  -- Collaborators
  IF (p_options->>'collaborators')::boolean IS TRUE THEN
    DELETE FROM public.trip_collaborators WHERE trip_id = p_trip_id;
  END IF;

  -- Invitations
  IF (p_options->>'invitations')::boolean IS TRUE THEN
    DELETE FROM public.trip_invitations WHERE trip_id = p_trip_id;
  END IF;

  -- AI (messages, conversations, trip memory)
  IF (p_options->>'ai')::boolean IS TRUE THEN
    DELETE FROM public.ai_trip_messages WHERE trip_id = p_trip_id;
    DELETE FROM public.ai_conversations WHERE trip_id = p_trip_id;
    DELETE FROM public.ai_trip_memory WHERE trip_id = p_trip_id;
  END IF;

  -- Logs (usage logs + notification logs)
  IF (p_options->>'logs')::boolean IS TRUE THEN
    DELETE FROM public.ai_usage_logs WHERE trip_id = p_trip_id;
    DELETE FROM public.notification_logs WHERE trip_id = p_trip_id;
  END IF;

  RETURN v_photo_paths;
END;
$$;


-- ============================================================
-- b) delete_trip_cascade
-- ============================================================

CREATE OR REPLACE FUNCTION delete_trip_cascade(p_trip_id UUID)
RETURNS TEXT[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_photo_paths TEXT[];
BEGIN
  -- Clear all related data
  v_photo_paths := public.clear_trip_data_cascade(
    p_trip_id,
    '{"activities":true,"stops":true,"budget":true,"packing":true,"photos":true,"collaborators":true,"invitations":true,"ai":true,"logs":true}'::jsonb
  );

  -- Delete the trip itself
  DELETE FROM public.trips WHERE id = p_trip_id;

  RETURN v_photo_paths;
END;
$$;


-- ============================================================
-- c) duplicate_trip_atomic
-- ============================================================

CREATE OR REPLACE FUNCTION duplicate_trip_atomic(
  p_source_trip_id UUID,
  p_user_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_new_trip_id UUID;
  v_day_rec RECORD;
  v_new_day_id UUID;
  v_cat_rec RECORD;
BEGIN
  -- 1. Copy trip row
  INSERT INTO public.trips (
    owner_id, name, destination, destination_lat, destination_lng,
    cover_image_url, cover_image_attribution, theme_color,
    start_date, end_date, currency, travelers_count, group_type,
    notes, fable_enabled, fable_budget_visible, fable_packing_visible,
    fable_web_search, fable_memory_enabled, fable_instruction, fable_recap,
    status
  )
  SELECT
    p_user_id, name || ' (Kopie)', destination, destination_lat, destination_lng,
    cover_image_url, cover_image_attribution, theme_color,
    start_date, end_date, currency, travelers_count, group_type,
    notes, fable_enabled, fable_budget_visible, fable_packing_visible,
    fable_web_search, fable_memory_enabled, fable_instruction, fable_recap,
    'planning'
  FROM public.trips
  WHERE id = p_source_trip_id
  RETURNING id INTO v_new_trip_id;

  IF v_new_trip_id IS NULL THEN
    RAISE EXCEPTION 'Source trip not found: %', p_source_trip_id;
  END IF;

  -- 2. Add owner as collaborator
  INSERT INTO public.trip_collaborators (trip_id, user_id, role)
  VALUES (v_new_trip_id, p_user_id, 'owner');

  -- 3. Copy itinerary_days + activities (mapping old day_id → new day_id)
  FOR v_day_rec IN
    SELECT id, date, notes FROM public.itinerary_days WHERE trip_id = p_source_trip_id
  LOOP
    INSERT INTO public.itinerary_days (trip_id, date, notes)
    VALUES (v_new_trip_id, v_day_rec.date, v_day_rec.notes)
    RETURNING id INTO v_new_day_id;

    INSERT INTO public.activities (
      day_id, trip_id, title, description, category,
      start_time, end_time, location_name, location_lat, location_lng,
      location_address, cost, currency, sort_order,
      check_in_date, check_out_date, category_data
    )
    SELECT
      v_new_day_id, v_new_trip_id, title, description, category,
      start_time, end_time, location_name, location_lat, location_lng,
      location_address, cost, currency, sort_order,
      check_in_date, check_out_date, category_data
    FROM public.activities
    WHERE day_id = v_day_rec.id;
  END LOOP;

  -- 4. Copy trip_stops
  INSERT INTO public.trip_stops (
    trip_id, name, lat, lng, address, type,
    nights, arrival_date, departure_date, sort_order, notes
  )
  SELECT
    v_new_trip_id, name, lat, lng, address, type,
    nights, arrival_date, departure_date, sort_order, notes
  FROM public.trip_stops
  WHERE trip_id = p_source_trip_id;

  -- 5. Copy budget_categories (no expenses)
  INSERT INTO public.budget_categories (trip_id, name, color, budget_limit)
  SELECT v_new_trip_id, name, color, budget_limit
  FROM public.budget_categories
  WHERE trip_id = p_source_trip_id AND scope = 'group';

  RETURN v_new_trip_id;
END;
$$;


-- ============================================================
-- d) toggle_reaction
-- ============================================================

CREATE OR REPLACE FUNCTION toggle_reaction(
  p_activity_id UUID,
  p_user_id UUID,
  p_emoji TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_existing_emoji TEXT;
BEGIN
  -- Check for existing reaction by this user on this activity
  SELECT emoji INTO v_existing_emoji
    FROM public.activity_reactions
    WHERE activity_id = p_activity_id AND user_id = p_user_id;

  IF v_existing_emoji IS NOT NULL THEN
    -- User already reacted
    IF v_existing_emoji = p_emoji THEN
      -- Same emoji → remove (toggle off)
      DELETE FROM public.activity_reactions
        WHERE activity_id = p_activity_id AND user_id = p_user_id;
    ELSE
      -- Different emoji → update
      UPDATE public.activity_reactions
        SET emoji = p_emoji
        WHERE activity_id = p_activity_id AND user_id = p_user_id;
    END IF;
  ELSE
    -- No existing reaction → insert
    INSERT INTO public.activity_reactions (activity_id, user_id, emoji)
    VALUES (p_activity_id, p_user_id, p_emoji);
  END IF;
END;
$$;


-- ============================================================
-- e) regenerate_receipt_expenses
-- ============================================================

CREATE OR REPLACE FUNCTION regenerate_receipt_expenses(
  p_receipt_id UUID,
  p_items JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_item JSONB;
BEGIN
  -- Delete all existing expenses for this receipt
  DELETE FROM public.expenses WHERE receipt_id = p_receipt_id;

  -- Insert new expenses from the JSONB array
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO public.expenses (
      trip_id, category_id, user_id, description, amount, currency,
      date, scope, paid_by, split_with, visible_to, creator_name, receipt_id
    )
    VALUES (
      (v_item->>'trip_id')::UUID,
      (v_item->>'category_id')::UUID,
      (v_item->>'user_id')::UUID,
      v_item->>'description',
      (v_item->>'amount')::DOUBLE PRECISION,
      COALESCE(v_item->>'currency', 'CHF'),
      (v_item->>'date')::DATE,
      COALESCE(v_item->>'scope', 'group'),
      (v_item->>'paid_by')::UUID,
      COALESCE((SELECT array_agg(elem::TEXT) FROM jsonb_array_elements_text(v_item->'split_with') AS elem), '{}'),
      COALESCE((SELECT array_agg(elem::TEXT) FROM jsonb_array_elements_text(v_item->'visible_to') AS elem), '{}'),
      v_item->>'creator_name',
      p_receipt_id
    );
  END LOOP;
END;
$$;


-- ============================================================
-- f) create_trip_with_owner — atomic trip creation + owner collaborator
-- ============================================================

CREATE OR REPLACE FUNCTION create_trip_with_owner(
  p_trip JSONB,
  p_user_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_trip_id UUID;
BEGIN
  INSERT INTO public.trips (
    owner_id, name, destination, destination_lat, destination_lng,
    cover_image_url, cover_image_attribution, theme_color,
    start_date, end_date, currency, travelers_count, group_type,
    notes, fable_enabled, fable_budget_visible, fable_packing_visible,
    fable_web_search, fable_memory_enabled, fable_instruction, fable_recap,
    status
  )
  VALUES (
    p_user_id,
    p_trip->>'name',
    p_trip->>'destination',
    (p_trip->>'destination_lat')::DOUBLE PRECISION,
    (p_trip->>'destination_lng')::DOUBLE PRECISION,
    p_trip->>'cover_image_url',
    p_trip->>'cover_image_attribution',
    p_trip->>'theme_color',
    (p_trip->>'start_date')::DATE,
    (p_trip->>'end_date')::DATE,
    COALESCE(p_trip->>'currency', 'CHF'),
    (p_trip->>'travelers_count')::INTEGER,
    p_trip->>'group_type',
    p_trip->>'notes',
    COALESCE((p_trip->>'fable_enabled')::BOOLEAN, true),
    COALESCE((p_trip->>'fable_budget_visible')::BOOLEAN, true),
    COALESCE((p_trip->>'fable_packing_visible')::BOOLEAN, true),
    COALESCE((p_trip->>'fable_web_search')::BOOLEAN, true),
    COALESCE((p_trip->>'fable_memory_enabled')::BOOLEAN, true),
    p_trip->>'fable_instruction',
    p_trip->>'fable_recap',
    COALESCE(p_trip->>'status', 'planning')
  )
  RETURNING id INTO v_trip_id;

  -- Add owner as collaborator in same transaction
  INSERT INTO public.trip_collaborators (trip_id, user_id, role)
  VALUES (v_trip_id, p_user_id, 'owner');

  RETURN v_trip_id;
END;
$$;
