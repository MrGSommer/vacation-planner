-- Fix: Trip owners missing from trip_collaborators table
-- 3 of 15 trips were created via an older code path that didn't insert the owner.
-- This caused trip-reminders to skip the owner (no notifications).

-- Fix 1: Backfill missing owner entries
INSERT INTO trip_collaborators (trip_id, user_id, role)
SELECT t.id, t.owner_id, 'owner'
FROM trips t
WHERE NOT EXISTS (
  SELECT 1 FROM trip_collaborators tc
  WHERE tc.trip_id = t.id AND tc.user_id = t.owner_id
)
ON CONFLICT DO NOTHING;

-- Fix 3: Safety-net trigger so this can never happen again
CREATE OR REPLACE FUNCTION ensure_owner_collaborator()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO trip_collaborators (trip_id, user_id, role)
  VALUES (NEW.id, NEW.owner_id, 'owner')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ensure_owner_collaborator ON trips;
CREATE TRIGGER trg_ensure_owner_collaborator
  AFTER INSERT ON trips
  FOR EACH ROW
  EXECUTE FUNCTION ensure_owner_collaborator();
