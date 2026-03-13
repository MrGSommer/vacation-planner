-- Add missing DELETE and UPDATE RLS policies for slideshow_shares

-- Allow users to delete their own slideshow shares
CREATE POLICY "Users can delete own slideshow shares"
  ON slideshow_shares
  FOR DELETE
  USING (created_by = auth.uid());

-- Allow users to update their own slideshow shares
CREATE POLICY "Users can update own slideshow shares"
  ON slideshow_shares
  FOR UPDATE
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());
