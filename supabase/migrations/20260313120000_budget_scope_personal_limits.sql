-- Add scope and user_id to budget_categories
ALTER TABLE budget_categories
  ADD COLUMN scope text NOT NULL DEFAULT 'group'
    CHECK (scope IN ('group', 'personal')),
  ADD COLUMN user_id uuid REFERENCES profiles(id) ON DELETE CASCADE;

-- Personal categories must have a user_id
ALTER TABLE budget_categories
  ADD CONSTRAINT budget_categories_personal_user_check
    CHECK (scope = 'group' OR user_id IS NOT NULL);

-- Personal budget limits on group categories (additive on top of group limit)
CREATE TABLE budget_personal_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES budget_categories(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  budget_limit double precision NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE (category_id, user_id)
);

-- RLS for budget_personal_limits
ALTER TABLE budget_personal_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own personal limits"
  ON budget_personal_limits
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Index for fast lookups
CREATE INDEX idx_budget_personal_limits_category ON budget_personal_limits(category_id);
CREATE INDEX idx_budget_categories_scope ON budget_categories(scope, user_id);
