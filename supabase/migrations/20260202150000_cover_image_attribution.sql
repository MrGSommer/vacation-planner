-- Add cover_image_attribution column for Unsplash attribution data
ALTER TABLE trips ADD COLUMN IF NOT EXISTS cover_image_attribution TEXT;
