# ePACE workspace

Open `/service-review-center/epace`, or choose **ePACE** in the Service Review Center profile menu. The workspace uses the existing application theme, PostgreSQL and signed-in accounts. It contains no seeded chat answers, trace rows, alerts, safety results or performance measurements.

## First use

1. Create or select a project.
2. Open **Developer settings**, select an available model and save. Model availability comes from the configured server provider.
3. Add your organization's source documents in **Knowledge & indexes**. PDF, DOCX, TXT, Markdown, CSV and JSON are supported. Scanned PDFs need text extraction before upload; OCR is not enabled.
4. Ask a question in **CognitiveConnect**. Open citations to inspect the actual retrieved source text.
5. Inspect the saved conversation in **Tracing & monitoring**. Charts populate from actual requests. Missing scores and measurements remain absent.

## Operations

| Workspace | Behavior |
| --- | --- |
| CognitiveConnect | Persisted conversations, source retrieval, actual model answers, citations, copy, human feedback, trace inspection and permanent conversation deletion. |
| Knowledge & indexes | Extracts text, indexes overlapping chunks, retrieves sources, exports text and deletes documents with their chunks. Keyword retrieval needs no embedding call; Semantic and Hybrid use real embeddings. |
| Developer settings | Model, evaluator, retrieval mode, semantic ranker, extractive captions, content checks, evaluation sampling, four quality thresholds, prompt, tags and retention settings are saved per project. |
| Tracing & monitoring | Runs, threads, stage timing, model usage, first-token timing, input/output/context, evaluation rationale, metadata, comparisons, filters and exports. Monitoring derives counts, rates, latency percentiles, token measurements and sampled quality scores from stored runs. |
| Safety & security | Persisted input/output policy wizard with category thresholds, block or annotate actions and a blocklist. Apply a policy to a project, test actual text moderation and inspect activity. |
| Quality alerts | In-app records created for actual quality threshold breaches or blocked requests. Inspect the associated run and acknowledge the alert. |
| Platform catalog | Register and update real components, ownership, lifecycle, repository, API and documentation links; download a runnable starter. |
| Create component | Built-in RAG starter template and user-managed templates, search, category/owner filters, stars and component registration. The downloaded ZIP has separate frontend/backend folders, required bearer authentication, retrieval, moderation and real provider calls. |
| Prompts & code assistant | Save/edit/apply prompts and request code using registered component requirements and project knowledge. Requests use the same tracing and safety pipeline. |
| Lifecycle & assessment | Day 0/1/2 component counts, six-pillar evidence-backed self-assessments and exports. Self-assessment scores are entered by the user, not measured model reliability scores. |
| Tech radar | Persisted Adopt, Trial, Assess and Hold technology decisions. |
| Access & audit | Account isolation and project change history. Shared organization memberships and role administration are not configured. |

## Live data and boundaries

Project updates stream to connected pages through authenticated server-sent events, checking PostgreSQL every three seconds. Chat streams actual model events. With content safety enabled, answer text is delivered only after output moderation completes. No partial unmoderated answer is shown.

Evaluation runs on the configured sample of completed chats. Scores come from an actual evaluator request and are recorded separately from human feedback. No evaluation score is supplied when a request is unsampled or evaluation fails. Provider-reported generation tokens are stored on the run; additional model stages have separate trace usage and contribute to account usage. Charts are limited to the most recent 5,000 records in the snapshot, with the selected time window applied.

Moderation uses the configured OpenAI text moderation provider. ePACE's Low/Medium/High bands use category probabilities of 0.2/0.5/0.8. These are application policy bands, not Azure Content Safety severity levels. The four screenshot categories are supported; Azure deployment policies, image moderation and a dedicated jailbreak classifier are not connected.

Projects allow up to 2,000 indexed chunks; each upload is limited to 10 MB and 500,000 extracted characters. At most three chats per account can run concurrently, and a thread accepts one question at a time. Interrupted pending runs are marked failed after fifteen minutes on the next snapshot. Run/alert retention is applied when snapshots are read; default retention is thirty days.

The screenshot's Azure, LangSmith, AWS and IBM consoles are represented by ePACE's own operations views. This does not connect those external consoles. Cloud provisioning, GitHub/DevOps deployment actions, external email delivery, organization-wide RBAC, infrastructure cost optimization and automated model drift/hyperparameter tuning require their actual services and credentials. No UI reports those services as deployed or active.

## Configuration and verification

Use the existing ignored `.env`: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` and `OPENAI_API_KEY`. `BETTER_AUTH_URL` must match the browser's public origin, locally `http://localhost:3000`. Keys stay on the server. No additional ePACE key is required for the current provider.

Apply migrations with `npm run db:migrate`, then run `npm run dev`. Migration `0009_epace.sql` adds the account-scoped project, record, chunk and audit tables.

`node scripts/test-epace.mjs` verifies persistence, access boundaries, origin rejection, Markdown/PDF/DOCX extraction, filters, starter artifacts, streaming snapshots and deletion. `node scripts/test-epace.mjs --live` additionally calls the real provider for retrieval, ranking, captions, generation, evaluation and moderation. Live verification incurs normal provider usage. Verification uses disposable accounts and removes them and their records afterwards.
