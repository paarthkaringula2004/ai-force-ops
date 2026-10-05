# ADR-0002: PostgreSQL persistence and authentication scope

- Status: Accepted (authentication detail is superseded by ADR 0003)
- Date: 2026-10-03
- Decision owner: Product owner
- Supersedes: Backend database and authentication entries in ADR 0001

## Context

The project owner decided not to use Clerk or Convex. The application will use PostgreSQL and SQL for persistent data, with the project connecting its features to that database as requirements are implemented.

## Decision

- Use PostgreSQL as the relational database and SQL as the data query language.
- Use the owner-configured Railway PostgreSQL service for the current deployment and the `pg` Node.js driver for parameterized SQL.
- Use SQL files in `db/migrations/` with the checked-in migration runner for application tables. Better Auth manages its own identity schema through its migration command.
- Do not use Convex or Clerk in this project.
- Use the Railway public proxy URL for local development; use the environment-specific Railway connection string for deployed runtime as appropriate to its network.
- The email/password approach is recorded in ADR 0003.

## Consequences

- Users, sessions, agents, workflow graphs, Playground settings, and Playground messages are stored in PostgreSQL.
- SQL queries scope application records to the authenticated user; agent workflows are tied to their owning agent with a cascading foreign key.
- Existing browser-local agent/workflow drafts are imported once per signed-in user without overwriting records already stored in PostgreSQL.
- PostgreSQL persistence is request/response based; live cross-session subscriptions have not been specified or implemented.

## Follow-up

- Define identity, user, and tenant requirements before adding roles, organizations, or tenant boundaries.
- Define organization/tenant ownership if the product expands beyond an individual account workspace.
- Define backup/restore, production pool sizing, and deployment migration orchestration.
