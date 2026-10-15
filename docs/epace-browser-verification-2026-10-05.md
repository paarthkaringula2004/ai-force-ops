# ePACE browser verification — 5 October 2026

Environment: local application at localhost:3000, signed-in account, real PostgreSQL and OpenAI API. Test records are retained in **ePACE Verification — 5 Oct 2026**. Original project settings were not activated or changed. An accidentally saved, unactivated verification filter in the original project was removed after discovering the project-switching race.

## Verified through the browser

- Created the verification project and registered **ePACE RAG Verification Component** using the built-in template. Edited its lifecycle to **Onboard & stabilize**. The lifecycle counts changed from Day 0: 1 / Day 1: 0 to Day 0: 0 / Day 1: 1.
- Catalog component, API and documentation tabs showed the saved component. Search excluded a nonmatching component. Generated starter archive contains six files including frontend, backend, configuration and README; backend syntax and component identity were checked separately. The starter was not deployed or executed against cloud infrastructure.
- Created and applied **Verification safety policy**, with separate input/output rules and a harmless verification blocklist phrase. Real moderation accepted safe input and safe output, blocked the configured phrase, and flagged a violent output example with high violence probability. The final safe-output test also created its audit entry.
- Moderation history showed the three checks and the correct category counts. Blocked tests created real quality-alert records with their originating run IDs.
- Created **Verification lifecycle assessment**. A rating without evidence was rejected; an evidence-backed rating saved, rendered and exported.
- Created a PostgreSQL verification radar entry in the Trial ring.
- Created and applied **Verification engineering prompt** using gpt-4o-mini. The code assistant generated a fenced JavaScript example with Markdown. Sampling was deliberately 100% with thresholds of 5 in this verification project only. The real evaluator returned groundedness 1/5 and fluency/relevance/coherence 5/5, producing **Model output quality degraded**.
- Runs, blocked-status filtering, run export, conversation listing and monitor charts showed actual persisted records. Access & audit showed account ownership and the recorded project changes.
- Created and starred **Verification reusable service template**. Owner/star filters worked; choosing it prefilled component registration.
- All three resulting alerts appeared in eAssist and were forwarded to the configured live Alertmanager. Acknowledging the output safety alert in ePACE changed eAssist from three active alerts to two without Refresh. The live Alertmanager API also returned the two remaining active signals.

## Fixes made during verification

- Removed Deployment readiness from the ePACE menu.
- Blocked moderation tests now create Quality alerts, rather than appearing only in moderation history.
- Try it out supports input and output policies; pending tests lock their text/stage and clear stale results. Safety tests are audited and new alerts identify the tested stage.
- Project selection now shows the selected project immediately and waits for its records before enabling workspace content. Switching clears dialogs and old moderation results; switching is disabled during a write.
- Missing assessment evidence now names the affected capability. The API validates the lifecycle stage.

Production build and lint passed; lint retains one pre-existing unused-import warning in service-review-connectors.mjs. Changes are local and are not confirmed deployed to Render. Existing document-upload and ordinary chat flows were not repeated in this verification; no company SSO, external cloud provisioning or infrastructure execution is implied.
