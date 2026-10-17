UPDATE security_tool_connections
SET
    user_id = o.owner_id
FROM
    organization_workspace o
WHERE
    o.owner_id IS NOT NULL
    AND user_id <> o.owner_id;

UPDATE vulnerability_imports
SET
    user_id = o.owner_id
FROM
    organization_workspace o
WHERE
    o.owner_id IS NOT NULL
    AND user_id <> o.owner_id;

UPDATE vulnerability_findings v
SET
    scope = v.scope || ' (previous account ' || v.user_id || ')'
FROM
    organization_workspace o
WHERE
    v.user_id <> o.owner_id
    AND EXISTS (
        SELECT
            1
        FROM
            vulnerability_findings x
        WHERE
            x.user_id = o.owner_id
            AND x.scope = v.scope
            AND x.identity = v.identity
    );

UPDATE vulnerability_findings
SET
    user_id = o.owner_id
FROM
    organization_workspace o
WHERE
    o.owner_id IS NOT NULL
    AND user_id <> o.owner_id;

-- Preserve the owner of queued/running jobs so in-flight workers can finish safely.
UPDATE security_scan_jobs
SET
    user_id = o.owner_id
FROM
    organization_workspace o
WHERE
    o.owner_id IS NOT NULL
    AND user_id <> o.owner_id
    AND status NOT IN ('queued', 'running');