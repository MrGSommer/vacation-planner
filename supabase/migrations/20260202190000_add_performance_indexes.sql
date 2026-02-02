-- Performance indexes for common query patterns

-- activities: frequently queried by trip_id and day_id
CREATE INDEX IF NOT EXISTS idx_activities_trip_id ON activities(trip_id);
CREATE INDEX IF NOT EXISTS idx_activities_day_id ON activities(day_id);

-- expenses: queried by trip_id
CREATE INDEX IF NOT EXISTS idx_expenses_trip_id ON expenses(trip_id);

-- budget_categories: queried by trip_id
CREATE INDEX IF NOT EXISTS idx_budget_categories_trip_id ON budget_categories(trip_id);

-- itinerary_days: queried by trip_id, sorted by date
CREATE INDEX IF NOT EXISTS idx_itinerary_days_trip_id_date ON itinerary_days(trip_id, date);

-- trip_stops: queried by trip_id, sorted by sort_order
CREATE INDEX IF NOT EXISTS idx_trip_stops_trip_id ON trip_stops(trip_id);

-- photos: queried by trip_id, sorted by taken_at
CREATE INDEX IF NOT EXISTS idx_photos_trip_id_taken_at ON photos(trip_id, taken_at DESC);

-- packing_lists: queried by trip_id
CREATE INDEX IF NOT EXISTS idx_packing_lists_trip_id ON packing_lists(trip_id);

-- packing_items: queried by list_id
CREATE INDEX IF NOT EXISTS idx_packing_items_list_id ON packing_items(list_id);

-- trip_collaborators: queried by trip_id
CREATE INDEX IF NOT EXISTS idx_trip_collaborators_trip_id ON trip_collaborators(trip_id);
