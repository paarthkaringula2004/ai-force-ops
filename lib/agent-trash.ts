import { db } from "@/lib/db";

/** Permanently remove agents whose 30-day recovery window has elapsed. */
export async function purgeExpiredAgentTrash() {
  const result = await db.query<{ deletedCount: number }>(`
    WITH expired_releases AS MATERIALIZED (
      SELECT release.public_id, release.user_id
      FROM published_agents AS release
      JOIN agents AS agent
        ON agent.user_id = release.user_id AND agent.id = release.agent_id
      WHERE agent.deleted_at <= now() - interval '30 days'
    ), removed_conversations AS (
      DELETE FROM published_conversations AS conversation
      USING expired_releases AS release
      WHERE conversation.user_id = release.user_id
        AND conversation.public_id = release.public_id
      RETURNING conversation.conversation_id
    ), removed_agents AS (
      DELETE FROM agents
      WHERE deleted_at <= now() - interval '30 days'
      RETURNING id
    )
    SELECT count(*)::int AS "deletedCount" FROM removed_agents
  `);
  return result.rows[0]?.deletedCount ?? 0;
}
