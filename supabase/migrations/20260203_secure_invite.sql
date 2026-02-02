-- lookup_invite: returns invitation + trip preview (SECURITY DEFINER bypasses RLS)
CREATE OR REPLACE FUNCTION lookup_invite(invite_token UUID)
RETURNS JSON AS $$
DECLARE
  inv RECORD;
  trp RECORD;
BEGIN
  SELECT * INTO inv FROM trip_invitations WHERE token = invite_token;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT id, name, destination, start_date, end_date INTO trp FROM trips WHERE id = inv.trip_id;
  RETURN json_build_object(
    'invitation', json_build_object(
      'id', inv.id, 'trip_id', inv.trip_id, 'role', inv.role,
      'status', inv.status, 'type', inv.type, 'token', inv.token
    ),
    'trip', json_build_object(
      'id', trp.id, 'name', trp.name, 'destination', trp.destination,
      'start_date', trp.start_date, 'end_date', trp.end_date
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- accept_invite: adds user as collaborator (SECURITY DEFINER bypasses RLS)
CREATE OR REPLACE FUNCTION accept_invite(invite_token UUID)
RETURNS JSON AS $$
DECLARE
  inv RECORD;
  uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RETURN json_build_object('error', 'Nicht eingeloggt');
  END IF;

  SELECT * INTO inv FROM trip_invitations WHERE token = invite_token;
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Einladung nicht gefunden');
  END IF;

  IF inv.status != 'pending' THEN
    RETURN json_build_object('error', 'Einladung wurde bereits verwendet');
  END IF;

  IF inv.type != 'collaborate' THEN
    RETURN json_build_object('error', 'Dieser Link ist kein Einladungslink');
  END IF;

  -- Insert collaborator (ON CONFLICT = already member)
  INSERT INTO trip_collaborators (trip_id, user_id, role)
    VALUES (inv.trip_id, uid, inv.role)
    ON CONFLICT (trip_id, user_id) DO NOTHING;

  -- Mark invitation accepted
  UPDATE trip_invitations SET status = 'accepted' WHERE id = inv.id;

  RETURN json_build_object('success', true, 'trip_id', inv.trip_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
