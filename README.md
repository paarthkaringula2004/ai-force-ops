# AIForce.Ops

AIForce.Ops is a SaaS Service Review Center. This repository is the working home for its product definition, architecture, implementation, and delivery artifacts.

## Project status

The implementation baseline is Next.js App Router, React, TypeScript, React Flow, Railway PostgreSQL with SQL via `pg`, Better Auth email/password sessions, OpenAI Agents SDK and API, Tailwind CSS with shadcn-style components, Arcjet, HTTPS integrations, and npm. Clerk and Convex are not part of this project. See [ADR 0002](docs/decisions/0002-postgresql-and-authentication.md) and [ADR 0003](docs/decisions/0003-email-password-authentication.md).

## Repository map

- `docs/` — product baseline, requirements, architecture, delivery plan, and decision records.
- `Template/` — complete project blueprint and reusable specification templates.
- `app/` — Next.js App Router routes, layouts, pages, and route handlers.
- `public/` — static assets.
- `components/`, `config/`, `lib/`, and `tests/` — reusable UI, service configuration, domain helpers, and verification.

The current working slice includes a public light-theme landing page, themed sign-in and sign-up, the Agent Studio Playground, agent configuration, and the React Flow workflow builder. Better Auth stores users and sessions in PostgreSQL. Authenticated APIs persist agents, workflow graphs, Playground settings and messages, tool metadata and knowledge summaries, profile details, and measured model usage per account. The Playground calls the OpenAI Agents SDK through server routes. Existing browser-local agent and workflow drafts are imported once after sign-in without replacing records already on the server.

The root route (`/`) is the public product landing page. The workspace and its private data APIs require sign-in. The workflow builder protects its Start node, saves a graph definition to PostgreSQL, and supports autosave or manual save. Publishing creates a versioned release snapshot and a server-side chat endpoint; that endpoint runs the agent’s configured model and instructions, but does not execute React Flow nodes yet. Tool Library and Knowledge Management store metadata and AI summaries; tool endpoint calls and tool credential storage are not enabled. Usage comes from provider-reported token counts. The token calculator is an explicitly labeled rough estimate. Payment plan screens show the requested catalog, but checkout and token crediting are not connected.

## Environment setup

Use `.env.example` as the variable-name reference and put real values in the ignored `.env` file. `OPENAI_API_KEY` powers the server-side Playground, tool summaries, and published-agent endpoint; it is never included in browser integration code. `DATABASE_URL` connects to PostgreSQL; `BETTER_AUTH_SECRET` signs authentication sessions; `BETTER_AUTH_URL` must match the address used by the browser. Set `NEXT_PUBLIC_AIFORCE_URL` to the deployed app origin to generate integration snippets for a deployed app. For local development on Railway-hosted PostgreSQL, use its public proxy connection string. `ARCJET_KEY` enables the configured request protection. Restart `npm run dev` after changing environment values.

Do not commit `.env` or share secret key values.

## Start here

1. [Product source baseline](docs/product-baseline.md)
2. [Phased implementation plan](docs/implementation-plan.md)
3. [Architecture decision records](docs/decisions/README.md)
4. [Project template map](Template/README.md)
5. [What we are building](docs/what-we-are-building.md)

## Run locally

```bash
npm install
npm run auth:migrate
npm run db:migrate
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), create an account at `/sign-up`, then sign in at `/sign-in`. Use `npm run lint` and `npm run build` to check the implementation.
