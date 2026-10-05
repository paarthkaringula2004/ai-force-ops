import { db } from "@/lib/db";
import { getRequestSession } from "@/lib/request-session";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const session = await getRequestSession(request);
  if (!session?.user) return Response.json({ error: "Sign in to export your workspace." }, { status: 401 });
  try {
    const userId = session.user.id;
    const [agents, workflows, settings, messages, tools, knowledge, usage, profile, publishedConversations] = await Promise.all([
      db.query(`SELECT id,name,purpose,model_id AS "modelId",instructions,created_at AS "createdAt",updated_at AS "updatedAt" FROM agents WHERE user_id=$1`, [userId]),
      db.query(`SELECT agent_id AS "agentId",graph,updated_at AS "updatedAt" FROM agent_workflows WHERE user_id=$1`, [userId]),
      db.query(`SELECT settings,updated_at AS "updatedAt" FROM playground_settings WHERE user_id=$1`, [userId]),
      db.query(`SELECT role,content,created_at AS "createdAt" FROM playground_messages WHERE user_id=$1 ORDER BY created_at ASC`, [userId]),
      db.query(`SELECT id,name,purpose,method,endpoint_url AS "endpointUrl",created_at AS "createdAt" FROM tools WHERE user_id=$1`, [userId]),
      db.query(`SELECT tool_id AS "toolId",summary,operations,model_id AS "modelId",analyzed_at AS "analyzedAt" FROM tool_knowledge WHERE user_id=$1`, [userId]),
      db.query(`SELECT source,model_id AS "modelId",input_tokens AS "inputTokens",output_tokens AS "outputTokens",total_tokens AS "totalTokens",created_at AS "createdAt" FROM usage_events WHERE user_id=$1 ORDER BY created_at DESC`, [userId]),
      db.query(`SELECT phone,birthday,updated_at AS "updatedAt" FROM account_profiles WHERE user_id=$1`, [userId]),
      db.query(`SELECT public_id AS "publicId",conversation_id AS "conversationId",messages,updated_at AS "updatedAt" FROM published_conversations WHERE user_id=$1 ORDER BY updated_at DESC`, [userId]),
    ]);
    return Response.json({ exportedAt: new Date().toISOString(), account: { name: session.user.name, email: session.user.email }, profile: profile.rows[0] ?? null, agents: agents.rows, workflows: workflows.rows, playgroundSettings: settings.rows[0]?.settings ?? {}, playgroundMessages: messages.rows, tools: tools.rows, toolKnowledge: knowledge.rows, publishedAgentConversations: publishedConversations.rows, usage: usage.rows });
  } catch { return Response.json({ error: "Could not export account data." }, { status: 503 }); }
}
