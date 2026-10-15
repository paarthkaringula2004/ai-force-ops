-- Admin identity is separate from employment records and survives role changes.
ALTER TABLE workspace_members ADD COLUMN admin_id text UNIQUE;
CREATE FUNCTION assign_workspace_admin_id() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.role = 'admin' AND NEW.admin_id IS NULL THEN
  NEW.admin_id := 'ADM-' || upper(replace(gen_random_uuid()::text, '-', ''));
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER workspace_admin_identity BEFORE INSERT OR UPDATE ON workspace_members
FOR EACH ROW EXECUTE FUNCTION assign_workspace_admin_id();
UPDATE workspace_members SET admin_id = 'ADM-' || upper(replace(gen_random_uuid()::text, '-', ''))
WHERE role = 'admin' AND admin_id IS NULL;
