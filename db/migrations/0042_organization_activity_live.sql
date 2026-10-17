CREATE FUNCTION organization_security_live () RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owner_id text;
BEGIN
 SELECT o.owner_id INTO owner_id FROM organization_workspace o WHERE id=true;
 IF owner_id IS NOT NULL THEN
  INSERT INTO eassist_revisions(user_id,revision) VALUES(owner_id,1)
  ON CONFLICT(user_id) DO UPDATE SET revision=eassist_revisions.revision+1;
 END IF;
 RETURN NULL;
END $$;

CREATE TRIGGER organization_security_events_live
AFTER INSERT ON organization_security_events FOR EACH ROW
EXECUTE FUNCTION organization_security_live ();