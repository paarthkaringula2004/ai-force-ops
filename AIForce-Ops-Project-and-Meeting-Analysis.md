# AIForce.Ops — Project overview

## What the project is

AIForce.Ops is a service operations platform built around a SaaS Service Review Center, Agent Studio, eAssist operational integrations, and ePACE knowledge and AI development workflows. It brings connected service health, alerts, incidents, automation results, security findings, and business readings into one workspace.

The product serves executives, business teams, command center operators, AI operations teams, and platform teams. Its purpose is to help people understand what is happening, inspect supporting evidence, and take supported operational actions.

This document describes implemented capabilities and their boundaries. Product concepts and example dashboards are not measured results or proof that integrations are installed.

## Agent Studio

Agent Studio provides Playground, Agents, Tool Library, Knowledge Management, General Instructions, Models, Settings, Usage, Token Calculator, and Payments views.

- Playground runs the selected OpenAI model through the server-side Responses API. It receives this project overview alongside the session's custom instructions.
- Agent definitions and ReactFlow graphs are stored in PostgreSQL. The visual editor supports editing, saving, versioned publishing, and a server-backed chat experience.
- Publishing an agent does not currently execute its ReactFlow nodes as an orchestration engine.
- Tool Library and Knowledge Management store definitions and supporting information. They do not automatically install software or enable arbitrary endpoint execution.
- Usage records provider token counts. Token estimates are estimates; the payment catalog is not a completed checkout or token-credit system.

Playground can explain the project and work with the conversation supplied to it. Its chat route does not attach live Review Center records or operational action tools. Knowing the project does not mean it has inspected an organization's live systems.

## Service Review Center

The Review Center organizes platform status, observability, business value, AI operations, executive summaries, data sources, geo health, and service details. Connected readings are stored in PostgreSQL with source identity, observation times, import times, and freshness information.

- Current connection errors take precedence over older healthy readings.
- Historical workflow results remain available without being mistaken for current incidents.
- Business value, forecasts, inventory, availability, and health depend on evidence supplied by connected sources.
- Geo health can use endpoint and public-IP information. Location estimates can describe a CDN or network endpoint rather than a physical business site.
- A healthy monitored endpoint does not prove that every part of the website or organization is healthy.

The product taxonomy uses IFSO, AISM, ISOA, AEM, P&C, and V&I. Their full expansions are not established in the project baseline and should not be invented. Persona views include CXO, HCBU, Command Center, AI Ops, and Platform. These views are not an implemented enterprise organization-membership or shared-role authorization system.

## eAssist operational integrations

Configured connectors support Semaphore, Prometheus, Alertmanager, and ServiceNow:

| Source | Purpose |
| --- | --- |
| Semaphore | Automation templates, tasks, output, and supported workflow operations |
| Prometheus | Configured monitoring readings |
| Alertmanager | Alerts and supported alert-management operations |
| ServiceNow | Configured incident information and supported incident operations |

Availability depends on configuration, credentials, network reachability, and the source API. Credentials remain server-side and are encrypted where stored. Supported writes use authorization, policy, approval, concurrency, idempotency, and audit controls. A connected source does not authorize every possible action exposed by that source.

The integration worker collects information independently of an open browser. Worker heartbeats and source freshness distinguish an active worker from stale or failed imports.

## Review Center Super assistant

The Super assistant is the conversational interface for monitored operations, scanner setup, alerts, and report downloads. It supports new chat, reload, history, and a Markdown-capable composer.

- Supported service-health and workflow answers use account-owned records and evidence.
- Answers distinguish source checks, successful imports, observation times, and workflow completion times. Operational timestamps are displayed in IST.
- Problems are summarized in plain language; detailed logs are available when requested.
- Guided scanner setup asks for necessary connection information. The manual integration interface opens through an explicit interface action.
- CSV and Excel requests can trigger a direct download from chat.
- Automated eAssist alerts appear in the assistant and the Automated Alert Center.

The default operational and security workflow uses supported intent handling without paid AI calls. It is not an unrestricted general-purpose language model. A separately configured paid AI path can analyze selected records. This differs from the model-backed Agent Studio Playground and ePACE conversations.

## Recovery and self-repair

Implemented recovery focuses on verifiable actions supported by existing connections:

1. Recheck an owned source and synchronize its readings.
2. Verify that a fresh source check and import completed.
3. Request an eligible failed workflow's retry through existing source action and approval controls.
4. Track the new task's actual result before reporting success.

A queued action or successful launch is not recovery. Missing runtimes, invalid credentials, denied access, stale sources, and unsupported actions require configuration or operator intervention. A missing PowerShell executable on a Semaphore runner cannot be fixed simply by retrying the task.

The assistant does not currently edit arbitrary repository code, install remote runtimes, restart arbitrary infrastructure, or guarantee repair of an unknown failure. A successful task verifies that task's result, not the health of the whole organization.

## Automated security and reporting

The security worker runs configured project checks, stores jobs and findings, and publishes report results and alerts.

- Built-in checks use ZAP web baseline/passive checks and Trivy checks against the configured source checkout.
- Continuous monitoring uses consecutive, non-overlapping scan cycles while the worker is active. Findings update after checks complete; this is not instant detection of every attack.
- Jobs expose phases, worker state, history, and completed report snapshots. Monitoring can be paused or resumed.
- Supported evidence imports include CSV, XLSX, and Nmap XML. Nmap port observations are informational unless additional evidence establishes a vulnerability.
- Scanner connections support compatible JSON findings APIs and ZAP APIs with authentication, result testing, and field mapping.
- Completed results export as CSV or formatted Excel workbooks containing recorded findings and evidence.
- Security conversations and the Automated Alert Center replace the standalone vulnerability-report workflow. The old vulnerability-report route redirects to the assistant.

Coverage depends on reachable public pages, configured source files, and connected scanners. Authenticated application testing, active exploitation, business-logic testing, all-network coverage, and breach investigation are not established by the built-in baseline. A vulnerability is not proof of a breach. Reports must identify untested areas rather than claim a complete pentest.

OWASP Juice Shop is a deliberately vulnerable testing target, not a scanner service. Nmap does not become a REST API simply by being named in chat. A new integration needs a supported API or worker adapter, authorization, connectivity, and a compatible evidence format. The assistant cannot automatically install and integrate every cybersecurity tool.

## ePACE

Within the Review Center, ePACE provides project-based knowledge and AI development workflows:

- PDF, DOCX, text, Markdown, CSV, and JSON ingestion with extracted text and stored chunks. Image-only document OCR is not implemented.
- Persisted Cognitive Connect conversations using configured models, retrieval, citations, feedback, and traces.
- Keyword retrieval and configured embedding-backed semantic or hybrid retrieval.
- Model, retrieval, evaluator, prompt, retention, and quality-control settings.
- Real run traces, latency, token usage, sampled evaluations, and quality alerts. Missing evaluation results are not replaced with fabricated scores.
- Configured moderation and content policies, blocklists, and quality-alert acknowledgment.
- Platform catalog, lifecycle information, code-assistant workflows, and downloadable RAG starter scaffolds.
- Stored technology-radar entries and user-entered maturity assessments.

Cloud-provider and developer-platform views do not mean external consoles are connected. Automatic cloud provisioning, universal deployment, organization-wide shared RBAC, and autonomous cost or drift remediation are not implemented.

## Architecture and data flow

The application uses Next.js, React, TypeScript, Tailwind CSS, ReactFlow, PostgreSQL through `pg`, Better Auth, OpenAI SDK and Agents SDK, and Arcjet request protection. ExcelJS supports workbook exports.

```text
Configured source APIs → integration worker → PostgreSQL readings and events
Configured scan targets → security worker → PostgreSQL jobs and findings
Stored evidence → Review Center / Super assistant / eAssist alerts / reports
Project knowledge + conversation → Playground or ePACE → configured AI provider
Supported recovery request → source action controls → source result verification
```

Authentication and record ownership protect private workspace data. API credentials remain server-side. Account-level isolation is implemented; full enterprise tenancy and shared organization permissions are separate future work.

## Running and configuring the project

Run commands from the `ai-force-ops` project directory:

```bash
npm install
npm run db:migrate
npm run dev
```

`npm run dev` starts Next.js, the integration worker, and the security worker together. The local website is normally at `http://localhost:3000`.

The environment must supply database and authentication configuration. Model-backed features require a server-side OpenAI key and an accessible model. Operational sources require configured endpoints and credentials. Security checks require the target, source checkout, and scanner runtime to be available to the worker.

Production deployment needs web and persistent worker processes with database connectivity, secrets, scanner dependencies, network access, and health checks. Starting only `next start` does not start workers. Standalone worker commands are `npm run eassist:worker` and `npm run security:worker`. Continuous monitoring stops if the host suspends or terminates workers. Free scanner software does not guarantee free hosting or model usage.

## Communicating project capabilities

When asked what AIForce.Ops is, explain the service operations platform and its four major areas: Agent Studio, Service Review Center, eAssist, and ePACE. Describe implemented features relevant to the question.

For live status, use current authorized source evidence and identify its freshness. If the current interface has no access to those records, explain where the user can view them rather than claiming the project itself is unknown. Keep confirmed implementation, current monitored state, and future capabilities distinct.

## Model usage and pricing

OpenAI is the application's AI provider. Provider token counts are recorded separately from ticket credits. Current standard-rate usage estimates apply OpenAI API cost × 2, with a configured USD/INR conversion of ₹96.48 per $1 and 100 tickets = ₹80. Simple standalone greetings use local replies with zero generative model tokens. Usage records preserve cache details and cost snapshots where available; unknown rates or incomplete charge details are disclosed rather than invented. Checkout and funded ticket balances require a payment provider and ledger.

The Playground model catalog refreshes the OpenAI API list, verifies text Responses support against official documentation, and separates compatible text models from models requiring other APIs. Selectable models appear in ascending budget order for equal input/output volumes, with Astra last by preference. Pending questions are saved with their reply only after a successful completion; failed sends restore the draft.
