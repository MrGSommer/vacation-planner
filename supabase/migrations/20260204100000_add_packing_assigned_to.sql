ALTER TABLE packing_items
  ADD COLUMN assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX idx_packing_items_assigned_to ON packing_items(assigned_to);
