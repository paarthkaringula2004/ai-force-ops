# What we are building

## In one sentence

**AIForce.Ops — Intelligent Service Operations Platform** is the project display name. The supplied product material describes it as a **SaaS Service Review Center** that brings service operations, environment health, automation, and business value into views for the people who run and review those services.

## The product map

The current source material names five audiences:

- CXO — Executive view
- HCBU — Business unit view
- Command Center — Operational view
- AI Ops — AI operations view
- Platform — Platform capability view

It names six platform capabilities: **IFSO, AISM, ISOA, AEM, P&C, and V&I**. The acronyms are labels from the source. Their expansions and ownership boundaries have not been confirmed.

It also identifies six product areas:

1. IFSO architecture
2. IEM Event → Incident lifecycle and metrics
3. AEM automation
4. Environment & Geo Health
5. Business Value Dashboard
6. Master Architecture

Environment & Geo Health includes inventory categories, region analysis, PROD/DEV/QA capacity forecasting, and country/site/category/device health concepts. The Business Value Dashboard includes Experience, Automation, Financial, and Innovation indices plus Benchmarked, Sustainability, and Tech Debt Reduction measures.

## What the first implementation should prove

The recommended first backend slice is the IEM Event → Incident path because it is the clearest named operational lifecycle in the source material. Before coding its data model or behavior, we need the exact states, transitions, metric formulas, fields, and system of record.

## Technical baseline chosen by the project owner

Next.js App Router, React, TypeScript, React Flow, Railway PostgreSQL with SQL via `pg`, Better Auth email/password sessions, OpenAI Agents SDK and API, Tailwind CSS with shadcn-style components, Arcjet, Next.js server/runtime, HTTPS APIs, and npm. Clerk and Convex are excluded.

The Product Overview page renders a typed, local catalog of source-established facts and open questions. The Templates page contains illustrative outlines rather than executable workflows. Sign-in, agents, workflow graphs, and Playground state are connected to PostgreSQL.

## What is not known yet

The full original screenshots/diagrams, exact IFSO architecture details, acronym expansions, IEM state/metric definitions, automation controls, metric formulas and data sources, persona permissions, external API systems, tenant model, hosting target, and release scope need confirmation.
