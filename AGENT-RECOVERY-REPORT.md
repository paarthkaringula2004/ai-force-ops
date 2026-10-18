# Admin agent recovery — 18 October 2026

Account: **ai.force.ops@gmail.com**. Database: **Aiven PostgreSQL / defaultdb**.

## Result

Rebuilt **32 agents** using the saved application presets, integration templates, and historical conversation evidence. This is a reconstruction from available definitions, not a complete restore of the deleted Railway database.

- Three main agents: CyberOpsAgent, DWP-MAIN-AGENT, and ActionableAgent.
- Eleven core specialists, including the Qualys specialist also used by an integration template.
- Eighteen integration templates. Qualys is shared by name, so it is created once.
- One previous unfinished Actual Agent draft, preserved as a Start-only canvas.
- GitHub repository lookup custom tool, recovered from the October 10/14 history. The old OWNER/REPO sample was parameterized as `{owner}/{repo}` for the current tool runtime.
- The built-in project tools and all 23 integration catalog definitions remain available from source. Catalog definitions do not imply a configured external connection.

Recreated agents are private to this Admin account. Old role shares, direct-recipient shares, and published links were not invented or enabled automatically.

## Connections and runtime

The source presets provide instructions, model settings, tool references, and specialist links. Parent references now point to the newly saved specialist IDs. Existing agents are preserved on a repeated run of the rebuild utility.

The missing organization integration owner was assigned to this Admin only because it was unset. Without that setting, Admin agent execution failed before reaching the model.

Verification completed:

- All 32 saved graphs pass the existing workflow normalizer.
- Specialist references resolve to agents owned by this account.
- Built-in references resolve to current project tools.
- CyberOpsAgent, DWP-MAIN-AGENT, and ActionableAgent load through the real runtime with a test model response.
- A real CyberOpsAgent model call returned **Agent recovery check passed.** The check disabled tool calls and requested no external actions.
- A repeated rebuild created zero duplicate agents and preserved all 32 existing records.
- ESLint passed for the recovery script.

## What still needs recovery or reconnection

Deleted connection credentials, uploaded knowledge and embeddings, custom edits absent from the saved definitions, former chat history, original sharing records, and configured rooms are not recovered by rebuilding agents. External services will need their settings restored before their operations can work. Missing knowledge should be reattached through Memory.

The historical audit retained only some workflow details and cannot establish a byte-for-byte copy of every agent's latest version. The source definitions provide the available instructions and behaviour; the report does not claim every old edit was recovered.

## Rebuilt agent names

- DWP-MAIN-AGENT
- Endpoint Operations Agent
- Software Inventory Agent
- BugScrubberAgent
- Identity Operations Agent
- ServiceNow Agent
- L2_network_Agent
- Assurance Agent
- CyberOpsAgent
- Leave Management
- New Employee Onboarding
- Armis API Agent
- IAM Agent
- Incident Analysis Agent
- Database Activity Monitoring Agent
- MeetRoom
- AEX IVR Agent
- BGP_Peers_Agent
- Actual Agent
- AEX-iAutomate Agent
- ActionableAgent
- Ansible Agent
- Qualys Scan Agent
- Monitor
- Canada RFP - IVR
- NRE Ansible Agent
- ServiceNow New
- SOC Agent
- Ansible Script Executer Agent
- Cloud Operations Agent
- ServiceNowMonitorAgent
- Systrack

## Recovery copies outside the database

The initial run saved `before-rebuild.json`, `after-rebuild.json`, and `rebuild-report.json` in:

`C:/Users/Paarth/Documents/AIForce-Ops-Recovery/2026-10-18T01-42-16.973Z/`

A second run has another snapshot folder beside it. These are local agent/tool exports, not a full database backup and not a replacement for scheduled external database backups. They do not include provider credentials or the full database.

## Repeatable local recovery command

```powershell
node scripts/rebuild-admin-agents.mjs ai.force.ops@gmail.com
```

That previews the planned source definitions. Add `--apply` to rebuild missing definitions. Run from the project root. The script requires the existing active Admin account and preserves existing same-name agents. Its TypeScript loader comes from the local test helpers; it is a maintenance command, not a web endpoint or an automatic deployment step.

Refresh Dashboard → Agents to load the rebuilt records.
