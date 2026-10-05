# ADR-0001: Application technology stack

- Status: Superseded by ADR 0002 for backend data storage and authentication
- Date: 2026-10-02
- Decision owner: Product owner
- Related requirements: Initial AIForce.Ops project setup

## Context

The project owner selected a target stack for developing AIForce.Ops. This records that direction without assuming package versions, service boundaries, data schemas, or deployment details not yet established.

## Decision

Use the following project baseline:

| Concern | Selected technology |
|---|---|
| Framework and runtime | Next.js App Router and Next.js server/runtime |
| UI framework | React |
| Language | TypeScript |
| Workflow canvas | React Flow |
| Backend and database | Convex (original selection; superseded) |
| Authentication | Clerk (original selection; superseded) |
| AI and agent runtime | OpenAI Agents SDK and OpenAI API |
| Styling and components | Tailwind CSS and shadcn-style components |
| Rate limiting and security | Arcjet |
| External integrations | HTTPS APIs |
| Package manager | npm |

## Consequences

- The existing Next.js, React, TypeScript, and Tailwind starter is the base for the first interface.
- Add the other libraries when the corresponding feature is implemented and its setup requirements are known.
- Authentication configuration, Convex schema and deployment, OpenAI model/agent behavior, Arcjet policies, API contracts, and production hosting remain to be specified.
- The supplied project tree is an example organization, not a requirement to copy every file or skill folder.

## Follow-up

- Keep secrets out of source control and use environment configuration for service credentials.
- Record deployment and security details in separate decisions once requirements are available.

This original stack decision is retained as project history. The current choices for relational persistence and authentication are recorded in [ADR 0002](0002-postgresql-and-authentication.md).
