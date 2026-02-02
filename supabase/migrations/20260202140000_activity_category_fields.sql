ALTER TABLE activities ADD COLUMN IF NOT EXISTS category_data JSONB DEFAULT '{}';

-- Migrate existing check_in/check_out to category_data for hotel activities
UPDATE activities
SET category_data = jsonb_build_object(
  'check_in_date', check_in_date,
  'check_out_date', check_out_date
)
WHERE category = 'hotel'
  AND (check_in_date IS NOT NULL OR check_out_date IS NOT NULL)
  AND (category_data IS NULL OR category_data = '{}');
