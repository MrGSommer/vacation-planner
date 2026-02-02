-- Vacation Planner Database Schema

-- Profiles (auto-created on auth.users insert via trigger)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trips
CREATE TABLE trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  destination TEXT NOT NULL,
  destination_lat DOUBLE PRECISION,
  destination_lng DOUBLE PRECISION,
  cover_image_url TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'planning' CHECK (status IN ('planning','upcoming','active','completed')),
  currency TEXT NOT NULL DEFAULT 'CHF',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trip Collaborators
CREATE TABLE trip_collaborators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('owner','editor','viewer')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(trip_id, user_id)
);

-- Itinerary Days
CREATE TABLE itinerary_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(trip_id, date)
);

-- Activities
CREATE TABLE activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day_id UUID NOT NULL REFERENCES itinerary_days(id) ON DELETE CASCADE,
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'other',
  start_time TEXT,
  end_time TEXT,
  location_name TEXT,
  location_lat DOUBLE PRECISION,
  location_lng DOUBLE PRECISION,
  location_address TEXT,
  cost DOUBLE PRECISION,
  currency TEXT NOT NULL DEFAULT 'CHF',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Photos
CREATE TABLE photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  url TEXT NOT NULL,
  thumbnail_url TEXT,
  caption TEXT,
  taken_at TIMESTAMPTZ,
  day_id UUID REFERENCES itinerary_days(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Budget Categories
CREATE TABLE budget_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#636E72',
  budget_limit DOUBLE PRECISION,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Expenses
CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES budget_categories(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount DOUBLE PRECISION NOT NULL,
  currency TEXT NOT NULL DEFAULT 'CHF',
  date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Packing Lists
CREATE TABLE packing_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Packliste',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Packing Items
CREATE TABLE packing_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id UUID NOT NULL REFERENCES packing_lists(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Sonstiges',
  is_packed BOOLEAN NOT NULL DEFAULT FALSE,
  quantity INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trip Invitations
CREATE TABLE trip_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  invited_email TEXT NOT NULL,
  invited_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('editor','viewer')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- RLS Policies
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_collaborators ENABLE ROW LEVEL SECURITY;
ALTER TABLE itinerary_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE packing_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE packing_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_invitations ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read all, update own
CREATE POLICY "Profiles readable by all" ON profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Trips: accessible to owner and collaborators
CREATE POLICY "Trips visible to participants" ON trips FOR SELECT
  USING (owner_id = auth.uid() OR id IN (SELECT trip_id FROM trip_collaborators WHERE user_id = auth.uid()));
CREATE POLICY "Owner can insert trips" ON trips FOR INSERT WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Owner can update trips" ON trips FOR UPDATE USING (owner_id = auth.uid());
CREATE POLICY "Owner can delete trips" ON trips FOR DELETE USING (owner_id = auth.uid());

-- Collaborators
CREATE POLICY "Collaborators visible to participants" ON trip_collaborators FOR SELECT
  USING (trip_id IN (SELECT id FROM trips WHERE owner_id = auth.uid()) OR user_id = auth.uid());
CREATE POLICY "Owner can manage collaborators" ON trip_collaborators FOR ALL
  USING (trip_id IN (SELECT id FROM trips WHERE owner_id = auth.uid()));

-- Trip-scoped tables: accessible if user is participant
CREATE OR REPLACE FUNCTION is_trip_participant(tid UUID) RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM trips WHERE id = tid AND owner_id = auth.uid()
    UNION
    SELECT 1 FROM trip_collaborators WHERE trip_id = tid AND user_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- Itinerary Days
CREATE POLICY "Days visible to participants" ON itinerary_days FOR SELECT USING (is_trip_participant(trip_id));
CREATE POLICY "Participants can manage days" ON itinerary_days FOR ALL USING (is_trip_participant(trip_id));

-- Activities
CREATE POLICY "Activities visible to participants" ON activities FOR SELECT USING (is_trip_participant(trip_id));
CREATE POLICY "Participants can manage activities" ON activities FOR ALL USING (is_trip_participant(trip_id));

-- Photos
CREATE POLICY "Photos visible to participants" ON photos FOR SELECT USING (is_trip_participant(trip_id));
CREATE POLICY "Participants can manage photos" ON photos FOR ALL USING (is_trip_participant(trip_id));

-- Budget Categories
CREATE POLICY "Budget cats visible to participants" ON budget_categories FOR SELECT USING (is_trip_participant(trip_id));
CREATE POLICY "Participants can manage budget cats" ON budget_categories FOR ALL USING (is_trip_participant(trip_id));

-- Expenses
CREATE POLICY "Expenses visible to participants" ON expenses FOR SELECT USING (is_trip_participant(trip_id));
CREATE POLICY "Participants can manage expenses" ON expenses FOR ALL USING (is_trip_participant(trip_id));

-- Packing Lists
CREATE POLICY "Packing lists visible to participants" ON packing_lists FOR SELECT USING (is_trip_participant(trip_id));
CREATE POLICY "Participants can manage packing lists" ON packing_lists FOR ALL USING (is_trip_participant(trip_id));

-- Packing Items (via list -> trip)
CREATE POLICY "Packing items visible" ON packing_items FOR SELECT
  USING (list_id IN (SELECT id FROM packing_lists WHERE is_trip_participant(trip_id)));
CREATE POLICY "Participants can manage packing items" ON packing_items FOR ALL
  USING (list_id IN (SELECT id FROM packing_lists WHERE is_trip_participant(trip_id)));

-- Invitations
CREATE POLICY "Invitations visible to involved" ON trip_invitations FOR SELECT
  USING (invited_by = auth.uid() OR invited_email = (SELECT email FROM profiles WHERE id = auth.uid()));
CREATE POLICY "Owner can create invitations" ON trip_invitations FOR INSERT
  WITH CHECK (trip_id IN (SELECT id FROM trips WHERE owner_id = auth.uid()));

-- Storage bucket for trip photos
INSERT INTO storage.buckets (id, name, public) VALUES ('trip-photos', 'trip-photos', true);

CREATE POLICY "Anyone can read trip photos" ON storage.objects FOR SELECT
  USING (bucket_id = 'trip-photos');
CREATE POLICY "Authenticated users can upload" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'trip-photos' AND auth.role() = 'authenticated');
CREATE POLICY "Users can delete own uploads" ON storage.objects FOR DELETE
  USING (bucket_id = 'trip-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Enable realtime for key tables
ALTER PUBLICATION supabase_realtime ADD TABLE activities, expenses, packing_items, photos;
