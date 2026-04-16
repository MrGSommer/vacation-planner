-- Photo limit enforcement for Free tier.
-- Free trips: max 10 photos per trip (incl. Unsplash inspiration photos).
-- Premium trips: unlimited.
--
-- Limit is determined by the TRIP OWNER's tier (not the uploader's) so a Free owner
-- can't invite a Premium collaborator as a "photo proxy".

CREATE OR REPLACE FUNCTION public.enforce_photo_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_owner_id uuid;
  v_is_premium boolean;
  v_photo_count int;
  v_limit int := 10; -- keep in sync with TIER_LIMITS.free.maxPhotosPerTrip in src/config/stripe.ts
BEGIN
  -- Find the trip owner
  SELECT owner_id INTO v_owner_id FROM public.trips WHERE id = NEW.trip_id;
  IF v_owner_id IS NULL THEN
    RETURN NEW; -- trip missing; let FK handle it
  END IF;

  -- Determine if owner is premium (mirrors SubscriptionContext logic)
  SELECT
    subscription_tier = 'premium'
    AND (
      subscription_status = 'active'
      OR (subscription_status = 'trialing'
          AND (subscription_period_end IS NULL OR subscription_period_end > now()))
      OR subscription_status = 'past_due'
    )
  INTO v_is_premium
  FROM public.profiles
  WHERE id = v_owner_id;

  IF COALESCE(v_is_premium, false) THEN
    RETURN NEW; -- no limit
  END IF;

  SELECT COUNT(*) INTO v_photo_count FROM public.photos WHERE trip_id = NEW.trip_id;

  IF v_photo_count >= v_limit THEN
    RAISE EXCEPTION 'photo_limit_reached'
      USING
        HINT = format('Free tier allows max %s photos per trip (current: %s).', v_limit, v_photo_count),
        ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_photo_limit_trigger ON public.photos;
CREATE TRIGGER enforce_photo_limit_trigger
BEFORE INSERT ON public.photos
FOR EACH ROW EXECUTE FUNCTION public.enforce_photo_limit();

COMMENT ON FUNCTION public.enforce_photo_limit IS
  'Blocks photo INSERTs when trip-owner is Free tier and trip already has 10 photos.';
