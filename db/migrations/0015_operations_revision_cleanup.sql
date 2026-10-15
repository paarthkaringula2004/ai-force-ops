CREATE OR REPLACE FUNCTION eassist_changed() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owner_id text;
BEGIN
 owner_id := COALESCE(NEW.user_id,OLD.user_id);
 IF EXISTS(SELECT 1 FROM "user" WHERE id=owner_id) THEN
  INSERT INTO eassist_revisions(user_id,revision) VALUES(owner_id,1)
  ON CONFLICT(user_id) DO UPDATE SET revision=eassist_revisions.revision+1;
 END IF;
 RETURN NULL;
END $$;
