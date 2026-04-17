-- Fix: Add partial unique index on (trip_id, type) WHERE is_active = true
-- The code in invitations.ts assumes this constraint exists but it was missing,
-- causing 409 conflicts when duplicate active links existed.

-- Deduplicate: keep only the newest active invitation per (trip_id, type)
UPDATE trip_invitations ti
SET is_active = false
WHERE ti.is_active = true
  AND EXISTS (
    SELECT 1 FROM trip_invitations ti2
    WHERE ti2.trip_id = ti.trip_id
      AND ti2.type = ti.type
      AND ti2.is_active = true
      AND ti2.created_at > ti.created_at
  );

-- Now create the partial unique index the code expects
CREATE UNIQUE INDEX IF NOT EXISTS idx_trip_invitations_active_unique
  ON trip_invitations (trip_id, type)
  WHERE is_active = true;
