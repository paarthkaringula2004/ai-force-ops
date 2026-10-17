ALTER TABLE eassist_activity
ADD COLUMN actor_id text REFERENCES "user" (id) ON DELETE SET NULL;

UPDATE eassist_activity
SET
    actor_id = user_id;

ALTER TABLE eassist_records
DROP CONSTRAINT eassist_records_user_id_connection_id_fkey;

ALTER TABLE eassist_records
ADD FOREIGN KEY (user_id, connection_id) REFERENCES eassist_connections (user_id, id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE eassist_operations
DROP CONSTRAINT eassist_operations_user_id_connection_id_fkey;

ALTER TABLE eassist_operations
ADD FOREIGN KEY (user_id, connection_id) REFERENCES eassist_connections (user_id, id) ON UPDATE CASCADE ON DELETE CASCADE;

UPDATE eassist_connections
SET
    user_id = o.owner_id
FROM
    organization_workspace o
WHERE
    o.owner_id IS NOT NULL
    AND user_id <> o.owner_id;

UPDATE eassist_activity
SET
    user_id = o.owner_id
FROM
    organization_workspace o
WHERE
    o.owner_id IS NOT NULL
    AND user_id <> o.owner_id;

UPDATE eassist_run_approvals
SET
    user_id = o.owner_id
FROM
    organization_workspace o
WHERE
    o.owner_id IS NOT NULL
    AND user_id <> o.owner_id;

UPDATE service_review_records
SET
    user_id = o.owner_id
FROM
    organization_workspace o
WHERE
    o.owner_id IS NOT NULL
    AND user_id <> o.owner_id;