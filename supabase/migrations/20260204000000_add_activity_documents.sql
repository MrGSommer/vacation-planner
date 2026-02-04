-- Activity documents table for file attachments
CREATE TABLE activity_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE activity_documents ENABLE ROW LEVEL SECURITY;

-- RLS: Participants can read
CREATE POLICY "Documents visible to participants" ON activity_documents FOR SELECT
  USING (is_trip_participant(trip_id));

-- RLS: Editors can upload
CREATE POLICY "Editors can insert documents" ON activity_documents FOR INSERT
  WITH CHECK (is_trip_editor(trip_id));

-- RLS: Editors can delete
CREATE POLICY "Editors can delete documents" ON activity_documents FOR DELETE
  USING (is_trip_editor(trip_id));

-- Index for fast lookup
CREATE INDEX idx_activity_documents_activity_id ON activity_documents(activity_id);

-- Storage bucket (run manually in Supabase Dashboard if not using CLI):
-- INSERT INTO storage.buckets (id, name, public) VALUES ('activity-documents', 'activity-documents', true);
