-- The former client persisted questions before calling OpenAI. Remove only stale,
-- unanswered trailing questions; keep all completed conversation turns.
DELETE FROM playground_messages pending
WHERE
    pending.role = 'user'
    AND pending.created_at < now() - interval '1 minute'
    AND NOT EXISTS (
        SELECT
            1
        FROM
            playground_messages reply
        WHERE
            reply.user_id = pending.user_id
            AND reply.role = 'assistant'
            AND reply.created_at > pending.created_at
    );