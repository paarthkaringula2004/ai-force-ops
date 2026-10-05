# ADR-0003: Email/password authentication

- Status: Accepted
- Date: 2026-10-03
- Decision owner: Product owner
- Related decision: ADR 0002

## Context

The product owner requested working sign-in and sign-up pages after excluding Clerk. User identity and application data must use the project's PostgreSQL database.

## Decision

- Use Better Auth for email/password authentication and cookie-backed sessions.
- Store Better Auth users, accounts, and sessions in the same PostgreSQL database as application data.
- Require a valid server-verified session for workspace pages, Playground API operations, agent records, and workflow graphs.
- Keep role-based access, organizations, email verification, and password recovery outside the first implementation until requirements and email delivery are defined.

## Consequences

- A private `BETTER_AUTH_SECRET` and canonical `BETTER_AUTH_URL` must be configured for each environment.
- Email/password sign-up and sign-in work without an external identity provider. Password reset and verification require a future email service decision.
- Application records are scoped to the authenticated user in SQL queries.
