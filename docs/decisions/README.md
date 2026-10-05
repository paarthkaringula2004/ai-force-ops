# Architecture decision records

Use one numbered record per consequential technical decision. Record the context, decision, alternatives considered, and consequences. Keep product facts in `../product-baseline.md`; use these records for implementation choices supported by established requirements.

Accepted decisions:

- [ADR 0002 — PostgreSQL persistence and authentication scope](0002-postgresql-and-authentication.md)
- [ADR 0003 — Email/password authentication](0003-email-password-authentication.md)

Superseded history:

- [ADR 0001 — Application technology stack](0001-technology-stack.md) (its Convex and Clerk selections are superseded by ADR 0002)

The following implementation details remain open and should be decided from requirements:

- Service boundaries and deployment topology.
- Organization/tenant model and role-based authorization.
- Email verification, password recovery, and email delivery provider.
- OpenAI agent behavior, model selection, and evaluation requirements.
- Arcjet policies and endpoint protection requirements.
- External API contracts and authentication.
- Hosting environment and release process.
