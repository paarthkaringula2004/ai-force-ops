INSERT INTO
    security_scan_schedules (user_id, frequency, next_run_at, updated_at)
SELECT
    o.owner_id,
    s.frequency,
    s.next_run_at,
    now()
FROM
    organization_workspace o
    CROSS JOIN LATERAL (
        SELECT
            frequency,
            next_run_at
        FROM
            security_scan_schedules
        ORDER BY
            updated_at DESC
        LIMIT
            1
    ) s
WHERE
    o.owner_id IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;

DELETE FROM security_scan_schedules s USING organization_workspace o
WHERE
    o.owner_id IS NOT NULL
    AND s.user_id <> o.owner_id;

INSERT INTO
    eassist_revisions (user_id, revision)
SELECT
    owner_id,
    1
FROM
    organization_workspace
WHERE
    owner_id IS NOT NULL
ON CONFLICT (user_id) DO UPDATE
SET
    revision = eassist_revisions.revision + 1;