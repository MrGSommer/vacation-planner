-- Slideshow sharing with music
CREATE TABLE slideshow_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token UUID NOT NULL DEFAULT gen_random_uuid(),
  music_track TEXT NOT NULL DEFAULT 'relaxed' CHECK (music_track IN ('relaxed', 'adventure', 'romantic', 'festive')),
  interval_ms INTEGER NOT NULL DEFAULT 4000 CHECK (interval_ms IN (3000, 4000, 6000)),
  photo_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  trip_name TEXT,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_slideshow_shares_token ON slideshow_shares(token);
CREATE INDEX idx_slideshow_shares_trip ON slideshow_shares(trip_id);

ALTER TABLE slideshow_shares ENABLE ROW LEVEL SECURITY;

-- Authenticated users can create for their own trips
CREATE POLICY "slideshow_shares_insert" ON slideshow_shares
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND trip_id IN (
      SELECT id FROM trips WHERE created_by = auth.uid()
      UNION
      SELECT trip_id FROM trip_collaborators WHERE user_id = auth.uid()
    )
  );

-- Authenticated users can read for their trips
CREATE POLICY "slideshow_shares_select" ON slideshow_shares
  FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR trip_id IN (
      SELECT id FROM trips WHERE created_by = auth.uid()
      UNION
      SELECT trip_id FROM trip_collaborators WHERE user_id = auth.uid()
    )
  );
