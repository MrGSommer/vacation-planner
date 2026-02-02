CREATE TABLE trip_stops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  place_id TEXT,
  address TEXT,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  type TEXT NOT NULL DEFAULT 'overnight' CHECK (type IN ('overnight','waypoint')),
  nights INTEGER DEFAULT 1,
  arrival_date DATE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  travel_duration_from_prev INTEGER,
  travel_distance_from_prev INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE trip_stops ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage stops for their trips" ON trip_stops
  FOR ALL USING (
    trip_id IN (
      SELECT trip_id FROM trip_collaborators WHERE user_id = auth.uid()
    )
  );
