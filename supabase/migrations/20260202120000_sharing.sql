ALTER TABLE trip_invitations
  ADD COLUMN token UUID DEFAULT gen_random_uuid(),
  ADD COLUMN type TEXT DEFAULT 'collaborate' CHECK (type IN ('info','collaborate'));

ALTER TABLE trip_invitations ALTER COLUMN invited_email DROP NOT NULL;

CREATE UNIQUE INDEX idx_trip_invitations_token ON trip_invitations(token);
