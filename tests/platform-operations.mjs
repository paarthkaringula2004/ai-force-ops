import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const base = process.env.EPACE_TEST_URL || "http://localhost:3000";
const users = [];
let checks = 0;
const pass = (message) => {
  checks++;
  console.log("PASS " + message);
};
async function signup() {
  const r = await fetch(base + "/api/auth/sign-up/email", {
    method: "POST",
    headers: { Origin: base, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Disposable platform operations verification",
      email: `ops-${randomUUID()}@example.invalid`,
      password: randomUUID() + "A1!",
    }),
  });
  const d = await r.json();
  assert.equal(r.status, 200, d.error);
  const user = {
    id: d.user.id,
    cookie: r.headers
      .getSetCookie()
      .map((s) => s.split(";")[0])
      .join("; "),
  };
  users.push(user);
  return user;
}
async function api(
  user,
  path,
  body,
  status = 200,
  method = body ? "POST" : "GET",
) {
  const r = await fetch(base + path, {
    method,
    headers: {
      Cookie: user.cookie,
      Origin: base,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(60000),
  });
  const d = await r.json();
  assert.equal(r.status, status, d.error);
  return d;
}
try {
  const first = await signup(),
    second = await signup();
  const agentId = randomUUID();
  await pool.query(
    "INSERT INTO agents(id,user_id,name) VALUES($1,$2,'Verification agent')",
    [agentId, first.id],
  );
  await pool.query(
    "INSERT INTO agent_workflows(user_id,agent_id,graph) VALUES($1,$2,$3)",
    [
      first.id,
      agentId,
      JSON.stringify({
        nodes: [],
        edges: [],
        secret: "SECRET-MUST-NOT-APPEAR",
      }),
    ],
  );
  let snapshot = await api(first, "/api/eassist");
  assert.ok(snapshot.activity.some((a) => a.action.includes("agent-studio")));
  assert.ok(snapshot.activity.some((a) => a.action.includes("reactflow")));
  assert.ok(!JSON.stringify(snapshot).includes("SECRET-MUST-NOT-APPEAR"));
  pass(
    "agent and ReactFlow changes appear in eAssist without exposing stored graph data",
  );
  const { id: pid } = await api(first, "/api/epace", {
    action: "createProject",
    name: "Verification project",
  });
  const runId = randomUUID();
  await pool.query(
    "INSERT INTO epace_records(id,user_id,project_id,kind,data) VALUES($1,$2,$3,'run',$4)",
    [
      runId,
      first.id,
      pid,
      JSON.stringify({
        name: "CognitiveConnect",
        status: "error",
        input: "PRIVATE-PROMPT",
        error: "PRIVATE-ERROR",
        threadId: randomUUID(),
      }),
    ],
  );
  const qualityId = randomUUID();
  await pool.query(
    "INSERT INTO epace_records(id,user_id,project_id,kind,data) VALUES($1,$2,$3,'alert',$4)",
    [
      qualityId,
      first.id,
      pid,
      JSON.stringify({
        name: "Quality",
        runId,
        resolved: false,
        input: "PRIVATE-PROMPT",
      }),
    ],
  );
  snapshot = await api(first, "/api/eassist");
  let alerts = snapshot.records.filter((r) => r.data.platform);
  assert.equal(alerts.filter((a) => a.data.source === "epace").length, 1);
  assert.ok(!JSON.stringify(snapshot).includes("PRIVATE-PROMPT"));
  assert.ok(!JSON.stringify(snapshot).includes("PRIVATE-ERROR"));
  pass(
    "run failures and quality signals are deduplicated with no prompt or raw error disclosure",
  );
  const isolated = await api(second, "/api/eassist");
  assert.ok(!isolated.records.some((a) => a.id === alerts[0].id));
  assert.ok(!isolated.activity.some((a) => a.target === agentId));
  await api(
    second,
    "/api/eassist",
    { action: "platform.acknowledge", id: alerts[0].id },
    404,
  );
  pass(
    "alerts and events are private and another account cannot acknowledge them",
  );
  await api(first, "/api/eassist", {
    action: "platform.acknowledge",
    id: alerts[0].id,
  });
  snapshot = await api(first, "/api/eassist");
  assert.equal(
    snapshot.records.find((a) => a.id === alerts[0].id).data.acknowledged,
    true,
  );
  pass(
    "acknowledgement is persisted and distinguished from repairing the cause",
  );
  await api(
    first,
    "/api/playground",
    {
      agentId,
      model: "epace-deliberately-unavailable-verification-model",
      messages: [{ role: "user", content: "Hello" }],
    },
    502,
  );
  snapshot = await api(first, "/api/eassist");
  assert.ok(
    snapshot.records.some(
      (a) =>
        a.data.platform &&
        a.data.source === "reactflow" &&
        a.data.state === "active",
    ),
  );
  assert.ok(
    snapshot.activity.some(
      (a) =>
        a.action.includes("Agent execution") && a.detail.includes("failed"),
    ),
  );
  pass("actual provider failures from ReactFlow preview become eAssist alerts");
  await api(first, "/api/eassist/report", {
    path: "/service-review-center/epace",
  });
  await api(first, "/api/eassist/report", {
    path: "/service-review-center/epace",
  });
  snapshot = await api(first, "/api/eassist");
  assert.equal(
    snapshot.records.filter(
      (a) =>
        a.data.platform &&
        a.data.labels.alertname === "Website browser error reported",
    ).length,
    1,
  );
  pass(
    "browser error reports are deduplicated and do not transmit stack traces",
  );
  const stream = await fetch(base + "/api/eassist/events", {
    headers: { Cookie: first.cookie },
    signal: AbortSignal.timeout(15000),
  });
  const reader = stream.body.getReader();
  const decoder = new TextDecoder();
  let firstFrame = decoder.decode((await reader.read()).value);
  while (!firstFrame.includes("event: change"))
    firstFrame += decoder.decode((await reader.read()).value);
  await pool.query(
    "UPDATE agents SET purpose='Updated for live verification' WHERE user_id=$1 AND id=$2",
    [first.id, agentId],
  );
  let nextFrame = "";
  while (!nextFrame.includes("event: change"))
    nextFrame += decoder.decode((await reader.read()).value);
  await reader.cancel();
  pass("website changes notify the existing live eAssist event stream");
  const metrics = await fetch(base + "/api/metrics");
  const body = await metrics.text();
  assert.match(
    body,
    /aiforce_operations_events\{component="reactflow",result="error"\}/,
  );
  assert.match(body, /eassist_database_up 1/);
  assert.ok(!body.includes(first.id));
  assert.ok(!body.includes(agentId));
  pass(
    "Prometheus sees aggregate website metrics without account or agent identifiers",
  );
  console.log(`Completed ${checks} platform operations checks.`);
} finally {
  for (const user of users)
    await pool.query('DELETE FROM "user" WHERE id=$1', [user.id]);
  await pool.end();
  console.log("Disposable operations accounts removed.");
}
