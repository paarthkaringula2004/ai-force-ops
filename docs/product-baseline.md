# Product source baseline

This document records what the supplied project material establishes. It separates observed product concepts from implementation choices that remain undecided.

## Product

**Name:** AIForce.Ops  
**Description:** SaaS Service Review Center

## Platform taxonomy

The supplied platform taxonomy contains these capability labels:

- IFSO
- AISM
- ISOA
- AEM
- P&C
- V&I

The source does not establish expansions for these labels or detailed ownership boundaries. Preserve the labels as supplied until definitions are confirmed.

## Personas and views

The supplied persona/view structure is:

| Persona | View context established |
|---|---|
| CXO | Executive view |
| HCBU | Business unit view |
| Command Center | Operational view |
| AI Ops | AI operations view |
| Platform | Platform capability view covering the taxonomy above |

A professional architecture representation connects personas to their view contexts and the platform capability view. Specific permissions, workflows, and persona-to-feature access rules are not established.

## Product areas represented in supplied material

### eAssist (Extensible Assistant)

The supplied diagrams establish eAssist as a real, extensible GenAI assistant for platform and operations teams. Its capabilities include grounded question answering, live operational data retrieval and analysis, task invocation, ITSM integration, configurable tools and instructions, document ingestion, multiple bot types, and log-based troubleshooting. The IBM MQ → monitoring alert → ITSM → AO Automation Accelerator flow is a target operational journey; it is not evidence that those systems are connected in the current application. See [eAssist product requirements](eassist-requirements.md) for the complete flow, reliability requirements, and external contracts needed before live execution.

### IFSO architecture

An IFSO architecture area is part of the product baseline. Its internal components and interfaces must be transcribed from the original source material before implementation details are assigned.

### IEM event-to-incident lifecycle

The supplied material identifies an **Event → Incident** lifecycle and associated metrics. The lifecycle stages, metric names, calculations, and thresholds need to be captured from source material before they become system behavior.

### AEM automation

AEM automation is an established product area. The source material does not establish execution semantics, approval controls, integrations, or automation authoring format.

### Environment & Geo Health

The supplied material includes:

- Environment inventory categories: Servers, Network, Storage, Appliances / Other, and Database.
- Regional analysis labels: EU, LATAM, and APAC.
- Capacity forecasting across PROD, DEV, and QA, with lower bound, upper bound, regression, and outlier concepts.
- Geo Health organized around country, site health, category health, device health, and errors.
- Example US site, device, category, and heartbeat-failure records.

Names, statuses, and addresses shown in screenshots are sample/reference data. They are not confirmed live integrations or production records.

### Business Value Dashboard

The supplied dashboard groups business value into Experience, Automation, Financial, and Innovation indices, with supporting Benchmarked, Sustainability, and Tech Debt Reduction measures. The supplied screenshot values include:

- Experience Index: 92% in one screenshot and 29% in another; source material does not resolve the discrepancy.
- Automation: 73%.
- Financial: $153K.
- Innovation: 86%.
- Benchmarked: 78%.
- Sustainability: 92%.
- Tech Debt Reduction: 27%.

These are captured as displayed examples, not metric definitions, committed targets, or validated current values. Calculation methods, time windows, data sources, and units (where not explicit) require confirmation.

### Master Architecture

A Master Architecture view is part of the requested project set. It should consolidate confirmed product areas and relationships without implying an unconfirmed runtime topology.

## Open product questions

These are requirements to establish, not assumptions to bake into code:

1. What do IFSO, AISM, ISOA, P&C, and V&I expand to, and what responsibilities belong to each?
2. What are the IFSO components and boundaries shown in the source architecture?
3. What are the IEM lifecycle stages and the exact associated metrics/formulas?
4. What automation actions, triggers, guardrails, and approval points does AEM support?
5. What are the definitions, data sources, time windows, and owners for each business-value metric?
6. Which dashboard details are representative data, and which are required product behavior?
7. What persona journeys and access rules are required?
8. Which external systems and data sources are in scope?
