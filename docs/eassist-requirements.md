# eAssist product requirements

This document translates the supplied eAssist diagrams into requirements for the real product. The word “Demo” in some slide titles describes the presentation material; it does not designate a demo-only implementation.

## Product purpose

eAssist (Extensible Assistant) is a configurable, GenAI-enabled assistant for Platform Engineering, Application Operations, and Middleware Operations teams. It should answer questions, retrieve current operational data, analyze evidence, and invoke authorized tasks through connected enterprise systems.

It is an operational product capability, not a static dashboard or a chat mockup. Live status and completed actions must come from the connected systems and durable application records. An unconfigured or unreachable integration must be shown as such; it must never be represented as connected or healthy based on sample data.

## Capabilities represented in the diagrams

- **Question answering:** answer from approved documentation and standard operating procedures, with traceable supporting sources.
- **Live data retrieval and analysis:** retrieve current signals from operational systems and use them to answer questions, summarize incidents, analyze logs, and troubleshoot.
- **Task invocation:** invoke explicitly configured and authorized operations, record their results, and verify outcomes.
- **ITSM integration:** find, create, update, and close incidents, subject to the connected ITSM contract and applicable approval policy.
- **Configurable assistants:** integrate tools, ingest documents, configure instructions, and select supported language models. The product should not assume a single model vendor.
- **Assistant types:** support chatbot, retrieval-augmented generation (RAG), and assistant/agent experiences.
- **Operational analysis:** support data analysis, summarization, log analysis, database and middleware assistants, DevOps/automation review, and ITSM inference.
- **Controlled automation:** represent codified tasks and autonomous execution as policy-governed capabilities. The diagrams do not specify which tasks may run without approval, so autonomy must not be inferred from the illustration.

## Reference operational journey: IBM MQ alert to verified remediation

The diagrams establish a cross-system use case involving IBM MQ, Prometheus and Alertmanager, ITSM, and AO Automation Accelerator:

1. Prometheus monitors service health and produces alert conditions; Alertmanager handles alert delivery/routing. IBM MQ is an operational source whose live queue or manager state can be queried. The exact direction and protocol between these monitoring components and IBM MQ must follow the deployed integration contracts.
2. eAssist retrieves relevant, current IBM MQ and Prometheus/Alertmanager evidence to answer an operator or decide whether a configured task is applicable.
3. For incident work, eAssist retrieves the relevant ITSM record or creates/updates an incident from an eligible alert. Closing an incident requires verified resolution evidence and the connected ITSM rules.
4. For remediation, eAssist retrieves an eligible pipeline from AO Automation Accelerator and invokes it only under its configured authorization and approval policy.
5. The system records the request, evidence, approvals, external identifiers, execution result, and independent post-action verification. Failures, timeouts, or inconclusive verification remain visible and must not be reported as resolved.

The intended high-level flow is therefore:

`monitoring / IBM MQ evidence → eAssist triage and context → ITSM incident lifecycle → approved AO remediation → independent verification → evidence-based incident update`

This is an intended workflow, not a claim that these external systems are currently connected in this repository.

## Reliability and safety requirements

- Deduplicate repeated alerts using stable source identifiers and make retried actions idempotent where the external system supports it.
- Preserve an auditable lifecycle for every alert, incident change, approval, automation request, result, and verification.
- Use an allowlisted action contract with narrowly scoped credentials; do not let generated model text execute arbitrary URLs, commands, or workflow nodes.
- Define authorization, approval, cancellation, timeout, retry, and escalation behavior for each action before enabling execution.
- Treat tool output and retrieved documents as untrusted input. Enforce tenant, user, and document access rules when retrieving context.
- Distinguish observed facts from model-generated summaries and recommendations. Keep source, timestamp, and external record links available to operators.
- Show connection state based on a successful, recent health check. A saved configuration by itself is not proof of a working connection.
- Persist operational records and configuration in PostgreSQL so refreshes and visits from another session preserve the state; keep credentials encrypted and out of browser-readable records.

## Current implementation evidence

The repository currently has authenticated agent and workflow persistence, tool metadata, knowledge summaries, and encrypted per-node agent credentials. Review Center readings are stored in PostgreSQL. These are useful platform foundations, but they do not implement the eAssist operational flow.

At the time this requirement was recorded, the Review Center persona selector contains eAssist and ePACE labels, but changing the selection only changes the displayed persona label. There is no eAssist view, IBM MQ/Prometheus/Alertmanager connector, ITSM adapter, AO Automation adapter, durable alert-to-remediation lifecycle, or action verification flow in the application. Existing tool definitions are metadata and are not executed as operational integrations.

## Contracts required before enabling live execution

The following are external-system requirements, not details that should be guessed in code:

| System | Required contract |
|---|---|
| IBM MQ | Product/version, supported query/API or approved gateway, queue/manager scope, authentication method, and permitted read/action operations |
| Prometheus / Alertmanager | Base URLs, API versions, authentication/TLS requirements, alert identity and labels, query scope, and delivery model (polling or webhook) |
| ITSM | Product/version, instance, API contract, incident fields and lifecycle mapping, assignment rules, idempotency strategy, and closure policy |
| AO Automation Accelerator | API/version, pipeline identity and inputs, execution and status APIs, approval requirements, idempotency, cancellation, timeout, and result contract |
| Identity and policy | Tenant/user mapping, service identities, role/permission model, approval authority, credential rotation, and audit retention |

## Implementation sequence

1. Add a dedicated eAssist workspace and navigation that accurately distinguishes setup, connection health, incoming events, assistant interactions, incidents, approvals, executions, and audit evidence.
2. Define PostgreSQL records and APIs for connector configuration metadata, event intake/deduplication, lifecycle transitions, approvals, execution requests/results, verification, and audit history. Store secrets only through the existing encrypted credential boundary or a reviewed secret-management integration.
3. Implement and verify read-only IBM MQ and Prometheus/Alertmanager access against the actual contracts; surface freshness and errors.
4. Add ITSM incident read/write behavior with tested mapping and idempotency.
5. Add AO pipeline discovery and guarded execution, approval and cancellation rules, then independent verification and evidence-based closure.
6. Add knowledge ingestion, citations, configurable assistant types, and model selection under the same authorization and audit rules.

No external connector should display “connected” until its real credentials and endpoint have passed a live health check. No remediation action should be enabled until its authorization, approval, retry, and verification behavior has been implemented and tested.
