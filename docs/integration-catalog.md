# Integration catalog and demo agent setup

Open **Admin → Tool Library → Integration catalog** (`/dashboard/tools`). This catalog adds connectors without replacing existing agents, custom tools, saved layouts, models or security-scan reports.

## Connecting an account later

1. Find the provider and choose **Set up**.
2. Enter the provider's account IDs and credentials. Secrets are encrypted with the existing application encryption key and are never returned by the setup API. Blank secret fields retain existing secrets; Disconnect removes the stored connection and approvals.
3. For ServiceNow and Semaphore, select **Use existing** to reference an existing enabled integration. No credential copy is needed.
4. Enable and save. This means *configured*, not *verified*.
5. Choose a read operation, review its example inputs and run **Check connection**. The state reports the selected operation's outcome and time, not blanket verification of every permission.
6. Connect the corresponding tool through **+ Tools** in Agent Studio or the Actual Agent tool panel. Credentials are resolved centrally at execution time; do not put them into prompts or nodes.
7. Use **Agent templates** to install individual or all missing templates. Same-name existing agents are returned unchanged, including instructions, graph positions and connections. Templates are editable and are not auto-published.

The catalog API and execution tools require an active Admin. Integration operations are disabled for public releases and shared previews. Existing non-Admin custom Tool Library behaviour is unchanged.

## Add your own integrations and project tools

Built-in workspace capabilities also have **Configure** and recoverable **Delete** controls. Configure changes the display name, description and enabled state. Chart Visualizer, meeting-room availability and ServiceNow incident reads support validated optional default inputs. Source implementations, caller permissions and read-only limits remain enforced by the server. Deleted and disabled tools disappear from the Agent Studio picker and existing references cannot execute them. Restoring a built-in tool leaves it disabled until explicitly enabled. These settings belong to the signed-in workspace owner; they do not delete source records or alter other owners' tools. Apply migration `0062_builtin_project_tool_settings.sql`.

Knowledge Management includes integration and project-tool metadata alongside the existing custom-tool knowledge. Unconfigured, disabled or disconnected entries have JSON `knowledge: null` and a visible **NULL — Please configure…** message. Enabled metadata describes available capabilities; it does not imply the source contains records or that an endpoint has been verified. Credential values, default payloads and API response bodies are not copied into knowledge. The open page refreshes every 15 seconds and on focus; manual refresh is also available.

General Instructions uses the shared Markdown editor with document formatting, formatted Word-content paste, a selection toolbar, a right-click format menu and keyboard shortcuts. Headings, emphasis, lists, links, tables and code are stored as Markdown in the existing instructions field, with its 12,000-character limit. It accepts copied Word content; it does not upload or parse a `.doc`/`.docx` file attachment.

**Add integration** creates a persistent card in a Not configured state. Choose a supported integration type to create another independent account connection (for example a second AWS account), or choose **Custom HTTP API** with no authentication, basic authentication, API-key/bearer authentication, or OAuth 2.0 client credentials. The custom OAuth adapter supports client-secret-post token acquisition. Other interactive OAuth flows can use a manually obtained bearer token or their dedicated connector.

Disabled connections may save partial setup. Enabling requires the required fields and valid operation mappings. **Configured** describes saved and enabled setup; a separate read-check status reports actual reachability. A configuration badge never means all permissions have been verified.

Use **Project tools → Add project tool** to give an integration operation a reusable name, purpose and default inputs. A connection can expose many differently named project tools. Built-in types can be bound before credentials are ready; custom APIs need their operation mappings saved first, which can be done while disabled. These tools appear under **+ Tools** in Agent Studio and in Actual Agent's Project Tools panel. They inherit the integration's connection state and resolve its encrypted credentials at execution time.

Custom project tools can be edited or deleted. An edited binding invalidates an older action approval through its binding fingerprint. The agent cannot switch a bound tool to a different provider or operation through its arguments. Defaults are merged at the top level with supplied inputs; replacing `body` replaces that default body as a whole.

The integration card's **Delete** icon disables and hides that integration and invalidates pending approvals, without altering existing agents. **Removed integrations** restores the card with the connection still disabled. **Deleted project tools** can restore custom tool bindings. Existing agent references to a deleted item report it unavailable; they do not silently switch to another source. Credential values are retained encrypted during recoverable card deletion; **Disconnect & remove credentials** separately removes the saved connection credentials.

Custom mappings accept JSON, form-encoded, XML or text bodies. Use `contentType` for the body format, `body` for JSON/form values, or `rawBody` for XML/text. An optional `form` mapping supports placeholders, and optional non-authentication `headers` supports source-specific metadata. Put credentials in connection authentication, never mapping headers, descriptions or default inputs.

## Coverage

- Amazon Connect: list queues, read contact details, prepare an outbound voice contact.
- Lambda: list functions and invoke a selected function.
- SES v2: read sending-account readiness and send a reviewed email.
- Cost Explorer: daily costs for explicitly supplied billing dates.
- EC2: describe instances and start/stop selected instances.
- Entra: directory users/groups and a selected user using Microsoft Graph application permissions.
- Azure VM: subscription inventory and start/deallocate.
- Azure Automation: list runbooks and submit runbook jobs.
- Confluence Cloud: pages, page content, spaces and reviewed page creation.
- ServiceNow: incident list/detail/create/update; update can include tenant-valid resolution fields.
- Ansible through Semaphore: templates, recent tasks and approved template launch.
- BigFix: computer/action reads and approved action XML submission.
- Qualys VM: scan list, detections and approved VM scan launch. Web application scanning is not implied by a VM account.
- Azure MCP: initialize a Streamable HTTP connection, discover tools, and approve tool calls. Tool calls conservatively require approval even if a server describes them as read-only. Tokens are supplied by the administrator; browser-interactive OAuth authorization is not implemented here.
- Web scraper: bounded HTTPS page retrieval and text extraction, no JavaScript execution or login bypass.
- DNR Mail Notifications: readiness and reviewed notifications through the existing mail outbox. DNR is the demo label, not a newly identified vendor. Queued means queued; Mail Center tracks delivery.
- Armis, SysTrack, Cisco ACI/BGP, Cisco bugs, NRE, iAutomate and the unidentified SOC platform: administrator-configurable API operation mappings. These are configurable adapters, not verified tenant-specific implementations. Their version-specific contracts and authentication must be supplied.

Only one source page is returned per operation. Responses identify paging limits; the system never treats the first page as a complete enterprise inventory. Asynchronous HTTP acceptance is surfaced separately from completion.

### Mapped API contract

For a provider with a private or version-specific API, enter a base URL, token, authentication header/prefix, and JSON mappings:

```json
[
  {"id":"assets","label":"List assets","method":"GET","path":"/api/assets?limit=25","example":{}},
  {"id":"asset","label":"Read asset","method":"GET","path":"/api/assets/{assetId}","example":{"assetId":"asset-id"}},
  {"id":"action","label":"Submit action","method":"POST","path":"/api/actions","example":{"body":{"target":"asset-id"}}}
]
```

These paths are examples, not vendor endpoints. Use the paths in your actual API documentation. Non-GET mappings always require an approval preview. Placeholders are encoded. Arbitrary custom headers and embedded URL credentials are not accepted. A custom OAuth token can be entered after obtaining it; arbitrary vendor-specific token refresh flows are not automatically inferred.

### Agent calls

Integration tools use JSON strings in the existing tool request argument:

```json
{"operation":"capabilities"}
```

```json
{"operation":"incidents","inputs":{}}
```

```json
{"operation":"create","inputs":{"body":{"short_description":"Observed issue","description":"Verified evidence"}}}
```

The final example produces an approval preview, not a change. The token is bound to owner, agent graph/node where applicable, connection configuration and credential fingerprint, operation and encrypted inputs. It expires in ten minutes and is consumed once before sending. A timeout must be investigated at the source before retrying; writes are never automatically retried.

## Optional read monitoring

Select a read operation and explicit inputs, then enable **Background read monitor**. Polling intervals range from one minute to one day and use the existing integration worker. Each provider has one monitor per owner. Latest results are encrypted; history contains metadata without credentials or full API bodies. A failed check retains an older successful result but marks its failure and timestamp explicitly. `operation=monitor_snapshot` reads that recorded evidence; it does not make a fresh source request.

Monitoring never automatically launches jobs, sends emails, invokes MCP tools, or changes source records. Notification tools can be used separately after review. Polling is active only while the application's integration worker runs.

## Deployment and access

- Apply migrations `0060_integration_catalog.sql` and `0061_custom_integrations_and_project_tools.sql` through `npm run db:migrate`.
- Keep `BETTER_AUTH_SECRET` stable; changing it without re-encrypting existing credentials breaks decryption.
- Existing mail configuration and mail worker are required for notifications.
- Existing `EASSIST_WORKER_TOKEN` and integration worker are required for polling.
- Public HTTPS destinations are DNS-checked and pinned for TLS requests. Private lab addresses need their exact origin in the existing server-managed `EASSIST_ALLOWED_ORIGINS`. Redirects are not followed. Response size and request duration are bounded.
- AWS uses Signature Version 4 with optional temporary session credentials. Renew temporary credentials through setup when they expire. No root credentials should be supplied.
- Azure uses client-credentials tokens. Appropriate Microsoft Graph grants and Azure RBAC assignments must be configured on the account.
- Enabling a cloud operation does not provision a contact flow, Linux lab, API entitlement, vendor tenant or paid subscription. Those are prerequisites supplied by the account owner.
- The IVR agent templates coordinate Connect operations; building a full real-time conversational telephone application, regional call routing and company-specific contact flows requires a separate defined voice deployment. Screenshot labels alone do not specify that deployment.
- Armis documentation answering requires actual indexed API documents attached through Memory; no documentation or private demo knowledge is fabricated.
- Unspecified demo test agents are not created as falsely functional agents.

## Verification record

See the implementation verification report for executed checks and any remaining live-account limitations. A local fixture success is not described as vendor acceptance or production certification.
