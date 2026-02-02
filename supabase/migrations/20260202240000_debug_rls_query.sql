-- Temporary: create a function to query policies (will be dropped after debugging)
CREATE OR REPLACE FUNCTION debug_get_policies(tbl text)
RETURNS TABLE(policyname name, cmd text, permissive text, roles text, qual text, with_check text) AS $$
  SELECT policyname, cmd, permissive, roles::text, qual, with_check
  FROM pg_policies
  WHERE tablename = tbl;
$$ LANGUAGE sql SECURITY DEFINER;

-- Also create a test function
CREATE OR REPLACE FUNCTION debug_test_participant(tid uuid)
RETURNS boolean AS $$
  SELECT is_trip_participant(tid);
$$ LANGUAGE sql SECURITY DEFINER;
