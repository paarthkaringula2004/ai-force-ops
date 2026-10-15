# Workspace tool controls and instruction editor

Delivered 15 October 2026:

- Built-in project tools now support Configure, enabled state, recoverable Delete and disabled Restore. Source records and agent graphs are preserved. Existing references reject execution when disabled/deleted; the picker omits unavailable tools. Chart, room and incident defaults are validated server-side.
- Custom project-tool deletion now uses an explanatory confirmation dialog. Project-tool cards refresh on focus, after changes and every 15 seconds while the page is visible.
- CUSTOM TOOLS heading identifies the existing custom HTTP tool section.
- Knowledge Management includes integration and project-tool metadata, search, counts, configuration state, read-check timestamps where available, and explicit NULL knowledge for unconfigured/disabled entries. Existing custom-tool summaries remain in their section. No credential or response-body ingestion is performed.
- Integrations and Project tools are separate bordered panels, each with a title, count and independent keyboard-focusable scroll region. Custom Tools is separate below them.
- General Instructions uses the existing shared Markdown editor in document mode, with a persistent formatting toolbar, selection toolbar, right-click formatting/link controls, formatted Word-content paste and existing Markdown storage. The field remains limited to 12,000 characters. Copy content from Word; Word file attachments are not imported by this field.

Verification completed:

- Migration 0062 applied.
- TypeScript and production build passed.
- Scoped lint passed for the new APIs, settings, project/knowledge UI and editor.
- Existing full Agent Studio suite passed with real PostgreSQL fixtures rolled back. Added checks cover settings persistence, owner isolation, disabled/deleted execution denial, disabled restoration and default-input validation.
- Integration extensibility suite passed.
- New tool-knowledge suite passed for authenticated ownership, role filtering, no-store responses, no secret queries, NULL disabled/unconfigured/disconnected entries and bound tools.
- Six existing Markdown checks passed, covering Word headings/emphasis/lists, tables, code, preserving Markdown and excluding executable markup/unsafe links.
- Browser checks verified Configure, saved disable, Delete confirmation, soft deletion, disabled Restore and re-enabling the tested My profile capability. Its original name, description and enabled state were restored.
- Browser paste produced rendered headings, bold/italic text and bullets; the right-click formatting menu appeared. The sample instructions were not saved.
- The final Knowledge Management layout was checked in the production browser: Project tools has a separate bordered panel, eight enabled capabilities, count/header and independent scroll region. Unconfigured integrations display NULL. The final build passed and npm start was restarted successfully.
- A configured 50-request-per-minute limit was encountered during browser verification. New automatic refresh loops now pause for Retry-After (at least 60 seconds) on HTTP 429. The organization limit was preserved.

These checks validate the implemented work. External account entitlement and permission checks still apply to live vendor operations; metadata availability is not proof of live data or vendor-wide verification.
