import { db } from "./db";
import { remote, type PrivateConnection } from "./eassist/transport";

export async function serviceNowStatus(owner: string) {
  const result = await db.query("SELECT name,enabled,state,checked_at AS \"checkedAt\" FROM eassist_connections WHERE user_id=$1 AND kind='servicenow' ORDER BY name", [owner]);
  return { configured: result.rows.length > 0, connections: result.rows, meaning: "A configured connection or past synchronization is not proof of current reachability. Live incident reads verify access when requested." };
}

export async function readServiceNowIncidents(owner: string, request = "") {
  let question = request, connectionName = "";
  try { const input = JSON.parse(request); if (typeof input?.question === "string") question = input.question; if (typeof input?.connectionName === "string") connectionName = input.connectionName; } catch { /* Natural-language requests are supported. */ }
  const result = await db.query<PrivateConnection>("SELECT * FROM eassist_connections WHERE user_id=$1 AND kind='servicenow' AND ($2='' OR name=$2) ORDER BY name", [owner, connectionName]);
  const connections = result.rows;
  if (!connections.length) return { mode: "not_connected", checkedAt: new Date().toISOString(), records: [], message: "ServiceNow is not connected in this workspace. No live instance status or incidents can be checked until an instance and authorized credentials are configured." };
  const enabled = connections.filter(connection => connection.enabled);
  if (enabled.length > 1) return { mode: "choose_connection", records: [], message: "Multiple ServiceNow instances are enabled. Choose the connection name before reading incidents.", connections: enabled.map(connection => connection.name) };
  const connection = enabled[0] || connections[0];
  const number = question.match(/\bINC\d+\b/i)?.[0].toUpperCase() || "";
  const cached = async () => (await db.query("SELECT data,observed_at AS \"observedAt\" FROM eassist_records WHERE user_id=$1 AND connection_id=$2 AND kind='incidents' AND ($3='' OR upper(data->>'number')=$3) ORDER BY observed_at DESC LIMIT 20", [owner, connection.id, number])).rows;
  if (!connection.enabled) return { mode: "paused", source: connection.name, records: await cached(), message: "The ServiceNow connection is disabled. Any returned incidents are saved records, not live results." };
  try {
    const fields = "sys_id,number,short_description,state,priority,opened_at,closed_at,sys_updated_on,assignment_group,assigned_to";
    const query = number ? `number=${number}` : "ORDERBYDESCsys_updated_on";
    const response = await remote(connection, `/api/now/table/incident?sysparm_limit=20&sysparm_exclude_reference_link=true&sysparm_fields=${fields}&sysparm_query=${encodeURIComponent(query)}`);
    if (!response || typeof response !== "object" || !Array.isArray((response as { result?: unknown }).result)) throw new Error("Invalid incident response.");
    const checkedAt = new Date().toISOString();
    const records = (response as { result: unknown[] }).result.slice(0, 20);
    if (records.some(record => !record || typeof record !== "object" || (typeof (record as { sys_id?: unknown }).sys_id !== "string" || !(record as { sys_id?: unknown }).sys_id))) throw new Error("Invalid incident record.");
    return { mode: "live", source: connection.name, checkedAt, scope: number ? `Incident ${number}` : "Latest 20 incidents ordered by source update time", records: records.map(data => ({ data, observedAt: checkedAt, source: connection.name })), message: "The configured ServiceNow incident API responded successfully at checkedAt. This verifies incident-read access, not every ServiceNow service or permission." };
  } catch {
    return { mode: "cached", source: connection.name, checkedAt: new Date().toISOString(), records: await cached(), message: "The live ServiceNow incident check failed. Current reachability is not verified. Any returned incidents are cached records and may be stale. Check credentials, allowed origin, incident-read permissions and connectivity in Integrations." };
  }
}
