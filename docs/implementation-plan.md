# Phased implementation plan

This plan moves from the supplied product evidence to an implemented and deployable system. The current stack direction is captured in ADR 0002; product behavior and deployment details will be established from requirements.

## Phase 0 — Product evidence and workspace foundation

**Status: started**

- Establish the repository and source-of-truth product baseline.
- Separate confirmed product concepts from screenshot examples and unknowns.
- Capture the remaining source material needed to specify each product area.
- Record consequential technical decisions with rationale as requirements become clear.

**Exit:** product areas, user journeys, key terms, metric definitions, and data ownership are sufficiently clear to prioritize a first release.

## Phase 1 — Requirements and product design

- Define the first release scope and success measures.
- Map persona journeys and required views.
- Specify the IFSO architecture, IEM event-to-incident lifecycle, AEM automation behavior, Environment & Geo Health, Business Value Dashboard, and Master Architecture.
- Establish data definitions, freshness expectations, error states, and accessibility needs.

**Exit:** reviewable product requirements and interface designs for the first end-to-end user journey.

## Phase 2 — Technical architecture

- Implement using the current baseline: Next.js App Router, React, TypeScript, React Flow, PostgreSQL with SQL, OpenAI Agents SDK and OpenAI API, Tailwind CSS with shadcn-style components, Arcjet, Next.js runtime, HTTPS integrations, and npm.
- Define service boundaries, identity and authorization details, API contracts, PostgreSQL schema and migrations, integrations, observability, and deployment approach.
- Document security, privacy, reliability, and operational requirements.

**Exit:** reviewed architecture and implementation decisions with a deployable first-slice design.

## Phase 3 — First end-to-end product slice

- Implement one prioritized persona journey through UI, API, and data flow.
- Use explicitly identified sample data where real integrations are not yet available.
- Add verification for the agreed acceptance criteria as implementation proceeds.

**Exit:** a working, reviewable slice with documented limitations and repeatable local execution.

## Phase 4 — Product capability increments

- Extend the first slice across the confirmed capability taxonomy and product areas.
- Add event-to-incident workflows, automation, health views, and value reporting in prioritized increments.
- Integrate external systems only after their contracts and operational requirements are established.

**Exit:** agreed release scope is implemented with evidence for its acceptance criteria.

## Phase 5 — Production readiness and deployment

- Validate security, performance, resilience, accessibility, monitoring, support procedures, and data handling against agreed targets.
- Prepare deployment, rollback, migration, and operational documentation for the selected environment.

**Exit:** release readiness review passes for the chosen operating environment.

## Immediate next development step

Use the interactive Product Overview as the project map and learning page. The initial authenticated data foundation is implemented for accounts, agent records, workflow graphs, and Playground settings/history. The newly supplied eAssist requirements prioritize an actual, auditable IBM MQ / Prometheus alert → ITSM incident → AO remediation journey. Before enabling external actions, establish the connector/API contracts and approval, retry, idempotency, and verification rules in [eAssist product requirements](eassist-requirements.md). Then implement the first end-to-end slice against the real systems; do not present illustrative data or unconfigured integrations as live.
