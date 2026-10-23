# AIForce.Ops Agent Studio — Page-by-Page File Map

This guide maps the Agent Studio website header, every left-navigation page, and the related agent builder, preview, and sharing screens to the project files that implement them. It follows the page-by-page structure of SERVICE-REVIEW-CENTER.md: each page has its own file-location heading and flowchart. All paths in the trees are relative to the ai-force-ops/ project root.

Agent Studio is the signed-in workspace at /dashboard. Its pages share one React shell; sidebar selections switch the page and update the browser path. The screenshot shows the Admin view of Playground. Other roles use the same shell with role-specific labels, navigation, permissions, assistant choices, and workspace links.

## Access shared by all pages

    app/dashboard/layout.tsx
    └── Requires a signed-in session before rendering dashboard routes

    app/dashboard/_components/AgentStudio.tsx
    └── Loads the signed-in member, filters navigation, checks page permissions, and renders the shared shell

    app/api/workspace/access/route.ts
    └── Supplies the signed-in member's workspace role and permissions

    lib/workspace-access.ts
    lib/workspace-permissions.ts
    └── Resolves workspace membership and applies role/permission rules

| Role | Agent Studio access and visible page differences |
|---|---|
| Admin | Full workspace access, including Administration and My Customization; can manage workspace configuration and use all enabled Agent Studio sections. |
| Manager | Agent Studio, team approvals, meeting rooms, manager knowledge, and Review Center access; Administration and My Customization are Admin-only. |
| Employee | Agent Studio and personal requests/meetings; ePACE is offered only after employment verification. Knowledge Management also requires verified employment. |
| User | Agent Studio and personal account/billing pages; cannot access employee-only requests, team approvals, Administration, My Customization, or employment-only knowledge/ePACE. |

Navigation visibility is permission-filtered in the shared shell, and APIs enforce their own access rules. Admin bypasses permission checks. Manager, Employee, and User capabilities may differ by page and by assigned permissions or employment verification. “User” here means the workspace role.

~~~mermaid
flowchart TD
    A[Open /dashboard] --> B[Require signed-in session]
    B --> C[Load workspace access]
    C --> D{Active role}
    D -->|Admin| E[Show all permitted sections]
    D -->|Manager| F[Show Agent Studio and manager sections]
    D -->|Employee| G[Show employee sections; ePACE if verified]
    D -->|User| H[Show general Agent Studio and account sections]
    E --> I[Render shared shell and selected page]
    F --> I
    G --> I
    H --> I
~~~

---

## Header of the Website — file locations

This is the shared Agent Studio header shown in the screenshot: menu toggle, AIForce.Ops identity, ticket balance, language control, full-screen toggle, Playground configuration toggle, Help, and signed-in account menu. The workspace title changes by role.

    app/dashboard/_components/AgentStudio.tsx
    └── Header, role-specific title and ticket badge, menu controls, sidebar, page routing

    components/auth/WorkspaceUserMenu.tsx
    └── Signed-in account menu

    components/workspace-link.tsx
    └── Permission-aware links to other workspace areas

    app/api/workspace/access/route.ts
    └── Supplies the member role and ticket balance displayed in the shell

    app/api/dashboard/updates/route.ts
    └── Supplies update timestamps used for navigation refresh indicators

The settings icon in the screenshot appears on Playground for members with Agent Studio permission; it opens the Playground configuration panel. The Help icon is currently a visual control without a page-navigation handler. The bottom workspace card is role-sensitive: Admin/Manager can see Review Center, while Employee can see ePACE when permitted.

~~~mermaid
flowchart TD
    A[Load shared Agent Studio shell] --> B[Fetch signed-in workspace member]
    B --> C[Set Admin, Manager, Employee, or User title]
    B --> D[Show role-appropriate ticket balance]
    B --> E[Filter sidebar using page permissions]
    A --> F[Render account menu and shell controls]
    F --> G{Current page and role}
    G -->|Playground with Agent Studio permission| H[Show configuration toggle]
    G -->|Admin or Manager with operations access| I[Offer Review Center link]
    G -->|Verified Employee with knowledge access| J[Offer ePACE link]
~~~

---

## Playground (Agent Studio Main Page) — file locations

**View:** Playground · **Route:** /dashboard

    app/dashboard/
    ├── page.tsx
    │   └── Route entry that mounts AgentStudio
    └── _components/
        ├── AgentStudio.tsx
        │   └── Shared shell and Playground selection
        └── PlaygroundView.tsx
            └── Chat, model selector, saved messages, role context, and configuration panel

    app/api/playground/
    ├── route.ts
    │   └── Runs a Playground request and returns the assistant response
    ├── state/route.ts
    │   └── Loads, saves, or clears the member's Playground state
    ├── models/route.ts
    │   └── Returns available OpenAI model choices
    └── employee/route.ts
        └── Supplies role-appropriate employee/workspace context

    lib/
    ├── playground-behavior.ts
    ├── playground-catalog.ts
    ├── playground-messages.ts
    ├── playground-models.ts
    ├── playground-response.ts
    ├── playground-tool-runtime.ts
    ├── playground-tools.ts
    ├── employee-playground.ts
    ├── employee-services.ts
    ├── user-playground.ts
    └── user-playground-choices.ts
        └── Role-specific prompts, choices, context, tool execution, and responses

    app/dashboard/_components/
    ├── PlaygroundToolConnections.tsx
    └── StudioStarters.tsx
        └── Playground connections and starter UI used by the view

The screenshot's “Your Admin Super Bot” is the Admin's role-specific Playground welcome state. Managers, Employees, and Users get their own workspace prompts and supported request choices. The model and configuration panel configure Playground; the sent message is handled by the Playground API and role-aware server logic. This chat is separate from saved agents and their workflow builder.

~~~mermaid
flowchart TD
    A[Open Playground] --> B[Load member role and saved Playground state]
    B --> C[Load available model choices]
    B --> D[Load role-specific context and request choices]
    C --> E[Render chat and selected model]
    D --> E
    E --> F{User action}
    F -->|Change settings| G[Open Playground configuration panel]
    G --> H[Save state through /api/playground/state]
    F -->|Send request| I[POST /api/playground]
    I --> J[Apply role-aware instructions and allowed tools]
    J --> K[Return assistant response and save state]
    K --> E
~~~

---

## My Requests Page — file locations

**View:** My Requests · **Route:** /dashboard/my-requests

    app/dashboard/
    ├── [section]/page.tsx
    │   └── Resolves my-requests to the My Requests view
    └── _components/
        ├── AgentStudio.tsx
        │   └── Mounts the personal request view in the shared shell
        ├── WorkspaceRoles.tsx
        │   └── Personal request list, status filter, details, and allowed cancellation
        └── RequestNotifications.tsx
            └── Request notifications and navigation

    app/api/workspace/
    ├── requests/route.ts
    │   └── Reads and updates the signed-in member's requests
    └── request-notifications/route.ts
        └── Loads and acknowledges request notifications

    lib/
    ├── workspace-decisions.ts
    └── request-notifications.ts
        └── Request decision and notification helpers

    db/migrations/
    ├── 0002_workspace_features.sql
    ├── 0029_workspace_roles.sql
    ├── 0030_workspace_chat_actions.sql
    └── 0077_request_notifications.sql
        └── Workspace role, request, and notification storage

My Requests is available to Admin, Manager, and Employee roles; User does not receive the employee request page. Each member sees their own requests. Approval decisions are made through manager/Admin flows, not by changing this page's display.

~~~mermaid
flowchart TD
    A[Choose My Requests] --> B{Role permission}
    B -->|Admin, Manager, Employee| C[Load member's requests]
    B -->|User or denied| D[Hide page or deny API access]
    C --> E[Filter by request status]
    E --> F[Open request details]
    F --> G[Show status, decision, and notification]
    F --> H{Request still cancellable?}
    H -->|Yes| I[Submit cancellation]
    H -->|No| J[Show current decision/status]
~~~

---

## Meeting Rooms Page — file locations

**View:** Meeting Rooms · **Route:** /dashboard/meeting-rooms

    app/dashboard/
    ├── meeting-rooms/page.tsx
    │   └── Route entry selecting Meeting Rooms
    └── _components/
        ├── AgentStudio.tsx
        │   └── Shared shell and meeting page selection
        ├── MeetingRooms.tsx
        │   └── Room setup, availability, booking, and reservation controls
        ├── MeetingInvitations.tsx
        │   └── Invitation and meeting notification UI
        ├── VirtualMeetings.tsx
        ├── GoogleVirtualMeetings.tsx
        └── TeamsVirtualMeetings.tsx
            └── Connected virtual meeting setup and provider workflows

    app/api/
    ├── meeting-rooms/route.ts
    │   └── Reads availability and creates/updates room bookings
    ├── meetings/route.ts
    │   └── Handles meeting records and invitations
    ├── google-meet/
    │   ├── start/route.ts
    │   └── callback/route.ts
    └── teams/
        ├── start/route.ts
        └── callback/route.ts
            └── Starts and completes Google Meet or Teams authorization

    lib/
    ├── meeting-rooms.ts
    ├── workspace-meetings.ts
    ├── google-meet.ts
    └── teams-meetings.ts
        └── Availability, booking, meeting, and provider helpers

    db/migrations/
    ├── 0052_meeting_room_bookings.sql
    ├── 0053_meeting_room_removal.sql
    └── 0054_teams_workspace_meetings.sql
        └── Room booking and meeting-provider state

All active signed-in roles can open Meeting Rooms. Room administration and booking actions are validated by the API. External meeting creation requires the corresponding provider to be configured and connected.

~~~mermaid
flowchart TD
    A[Choose Meeting Rooms] --> B[Load rooms, availability, and bookings]
    B --> C{Choose meeting mode}
    C -->|In person| D[Select location, room, and time]
    C -->|Virtual| E[Select configured meeting provider]
    D --> F[Check availability]
    E --> F
    F --> G{Available and permitted?}
    G -->|Yes| H[Confirm and save reservation]
    G -->|No| I[Show unavailable or setup guidance]
    H --> J[Send meeting invitation/notification]
~~~

---

## Team Requests Page — file locations

**View:** Team Requests · **Route:** /dashboard/team-requests

    app/dashboard/
    ├── [section]/page.tsx
    │   └── Resolves team-requests to the Team Requests view
    └── _components/
        ├── AgentStudio.tsx
        │   └── Shared shell and permission filtering
        ├── WorkspaceRoles.tsx
        │   └── Team request review, approve/reject decisions, and member administration
        ├── RequestNotifications.tsx
        └── AuditActivity.tsx
            └── Request alerts and audit history

    app/api/workspace/
    ├── requests/route.ts
    │   └── Manager-scoped team requests and decisions
    ├── request-notifications/route.ts
    │   └── Request notification state
    └── admin/route.ts
        └── Admin member/request operations used by administration UI

    lib/
    ├── workspace-decisions.ts
    ├── request-notifications.ts
    └── workspace-access.ts
        └── Team scope, approval rules, and member authorization

    db/migrations/
    ├── 0002_workspace_features.sql
    ├── 0029_workspace_roles.sql
    ├── 0030_workspace_chat_actions.sql
    └── 0077_request_notifications.sql
        └── Request, role, and notification records

Managers review requests for their assigned team. Admins can access broader administrative request/member views. Employees and Users do not see Team Requests in navigation.

~~~mermaid
flowchart TD
    A[Choose Team Requests] --> B{Role}
    B -->|Manager| C[Load manager's team requests]
    B -->|Admin| D[Load Admin-authorized request/member view]
    B -->|Employee or User| E[Hide page or deny access]
    C --> F[Review request and evidence]
    D --> F
    F --> G{Approve or reject}
    G --> H[Validate permission and save decision]
    H --> I[Notify requester and record audit activity]
~~~

---

## Administration Page — file locations

**View:** Administration · **Route:** /dashboard/administration

    app/dashboard/
    ├── [section]/page.tsx
    └── _components/
        ├── AgentStudio.tsx
        │   └── Admin-only route selection and shared shell
        ├── WorkspaceRoles.tsx
        │   └── Member roles, account status, requests, and administration panels
        ├── MemberPassword.tsx
        ├── StaffCatalogEditor.tsx
        ├── OrganizationSettings.tsx
        ├── MailCenter.tsx
        ├── SalarySettings.tsx
        ├── LeavePayReview.tsx
        ├── PaymentRefundReview.tsx
        ├── DeleteMember.tsx
        └── AuditActivity.tsx
            └── Account controls, catalogs, mail, payroll review, deletion, and audit UI

    app/api/workspace/
    ├── admin/route.ts
    ├── admin/password/route.ts
    ├── admin/mail/route.ts
    ├── admin/mail/customization/route.ts
    ├── admin/mail/attachments/route.ts
    ├── catalog/route.ts
    ├── employment/route.ts
    ├── salary/route.ts
    ├── requests/route.ts
    └── tickets/route.ts
        └── Admin member, role, catalogue, request, payroll, and ticket operations

    lib/
    ├── workspace-members.ts
    ├── workspace-member-password.ts
    ├── workspace-member-deletion.ts
    ├── staff-catalog.ts
    ├── staff-departments.ts
    ├── offer-customization.ts
    ├── mail.ts
    ├── leave-policy.ts
    ├── membership-plans.ts
    └── workspace-permissions.ts
        └── Server-side member, organization, mail, leave, and access logic

    db/migrations/
    ├── 0029_workspace_roles.sql
    ├── 0031_employee_verification.sql
    ├── 0032_organization_roles.sql
    ├── 0033_ticket_wallets.sql
    ├── 0035_admin_identity.sql
    ├── 0036_mail_outbox.sql
    ├── 0037_qualification_codes.sql
    └── 0038_staff_catalogs.sql
        └── Role, employment, ticket, organization, mail, and staff catalog state

Administration is Admin-only. It supports workspace member and role management, employment verification, organization catalogs/configuration, password actions, approved request/payment review, and audit information. Each action is guarded by its API permission and validation.

~~~mermaid
flowchart TD
    A[Open Administration] --> B{Admin permission}
    B -->|No| C[Hide route or reject API request]
    B -->|Yes| D[Load member and workspace data]
    D --> E{Choose admin task}
    E -->|Roles/accounts| F[Validate member change and save]
    E -->|Employment/catalogue| G[Update verification or staff data]
    E -->|Mail/payroll/payment| H[Apply configured review workflow]
    E -->|Delete member| I[Run guarded deletion workflow]
    F --> J[Record audit/change state]
    G --> J
    H --> J
    I --> J
~~~

---

## My Customization Page — file locations

**View:** My Customization · **Route:** /dashboard/my-customization

    app/dashboard/
    ├── [section]/page.tsx
    └── _components/
        ├── AgentStudio.tsx
        │   └── Shared shell and Admin-only page access
        └── MyCustomization.tsx
            └── Offer letter/document form, template editor, theme, and live preview

    app/api/workspace/
    ├── admin/mail/customization/route.ts
    │   └── Loads and saves reusable document/email customization
    ├── admin/mail/attachments/route.ts
    │   └── Manages configured template attachments
    ├── admin/mail/route.ts
    │   └── Sends or reviews configured mail workflow
    └── catalog/route.ts
        └── Supplies departments, positions, and workspace reference data

    lib/
    ├── offer-customization.ts
    ├── offer-template-store.ts
    ├── offer-template.ts
    ├── guided-offer.ts
    └── organization-mail-attachments.ts
        └── Template fields, rendering, saved state, and attachments

This Admin customization page uses workspace catalog information and the Admin sender profile to populate a live preview. Sending a document uses the mail workflow and its server-side validation.

~~~mermaid
flowchart TD
    A[Open My Customization] --> B[Load template and organization catalog]
    B --> C[Choose document type and theme]
    C --> D[Enter recipient and document details]
    D --> E[Render live preview]
    E --> F{Save edits or send}
    F -->|Save| G[Persist customization]
    F -->|Send| H[Validate recipient, sender, and fields]
    H --> I[Send through configured mail workflow]
~~~

---

## Agents Page — file locations

**View:** Agents · **Route:** /dashboard/agents

    app/dashboard/
    ├── agents/page.tsx
    │   └── Route entry mounting AgentStudio on Agents
    └── _components/
        ├── AgentStudio.tsx
        │   └── Shared shell and section selection
        └── AgentManager.tsx
            └── Agent cards, create/configure, import/export, ordering, sharing, and Bin

    components/
    ├── create-agent-dialog.tsx
    ├── agent-sharing.tsx
    ├── use-agent-card-drag.ts
    └── model-id-select.tsx
        └── Agent creation, sharing controls, card ordering, and model selection

    lib/
    ├── agent-store.ts
    ├── agent-card-order.ts
    ├── agent-sharing.ts
    ├── agent-trash.ts
    ├── agent-secrets.ts
    └── workflow-store.ts
        └── Agent records, role-aware sharing, ordering, trash, credentials, and workflows

    app/api/agents/
    ├── route.ts
    ├── order/route.ts
    ├── bin/route.ts
    ├── import/route.ts
    ├── import-published/route.ts
    ├── sharing/route.ts
    ├── integration-templates/route.ts
    ├── studio-templates/route.ts
    └── studio-options/route.ts
        └── Agent list and management endpoints

    app/api/agents/[agentId]/
    ├── route.ts
    ├── copy/route.ts
    ├── share/route.ts
    ├── publish/route.ts
    ├── restore/route.ts
    └── studio-backup/route.ts
        └── Per-agent configuration, copy, role sharing, publish, restore, and backup

    db/migrations/
    ├── 0001_app_data.sql
    ├── 0004_agent_trash.sql
    ├── 0049_agent_studio_backups.sql
    ├── 0050_agent_card_order.sql
    ├── 0051_agent_role_shares.sql
    ├── 0071_agent_sharing_admin_recipient.sql
    ├── 0073_employee_agent_recipients.sql
    ├── 0074_user_agent_copies.sql
    ├── 0075_manager_agent_recipients.sql
    └── 0076_scoped_agent_roles.sql
        └── Agent state, ordering, backups, sharing, copies, and role scopes

Agent cards are filtered by the API to the signed-in member's own, shared, or copied agents. An Admin-created agent is not automatically visible to every member unless the relevant organization or role sharing is configured. Moving an agent to Bin and permanent deletion are separate actions.

~~~mermaid
flowchart TD
    A[Open Agents] --> B[GET /api/agents for current member]
    B --> C[Show owned, shared, or copied agents]
    C --> D{Choose action}
    D -->|Create| E[Save agent and open workflow builder]
    D -->|Configure| F[Open /agent-builder/{agentId}]
    D -->|Share| G[Check recipient role and sharing permission]
    D -->|Publish| H[Create or update public snapshot]
    D -->|Delete| I[Move agent to Bin]
    I --> J{Restore or permanently delete}
    J -->|Restore| K[Restore saved agent]
    J -->|Permanent delete| L[Remove agent after confirmation]
~~~

---

## Tool Library Page — file locations

**View:** Tool Library · **Route:** /dashboard/tools (also recognized as /dashboard/tool-library)

    app/dashboard/
    ├── [section]/page.tsx
    │   └── Resolves tools/tool-library to Tool Library
    └── _components/
        ├── AgentStudio.tsx
        ├── WorkspaceSections.tsx
        │   └── Tool Library page, custom tool form, catalogs, and analysis actions
        ├── PlaygroundToolConnections.tsx
        ├── IntegrationCatalog.tsx
        └── ProjectToolCatalog.tsx
            └── Playground connections, integrations, and project-tool catalog

    app/dashboard/_components/ToolLibraryKnowledge.tsx
    └── Displays knowledge synchronized from configured tool definitions

    app/api/tools/
    ├── route.ts
    ├── integrations/route.ts
    ├── project/route.ts
    ├── playground/route.ts
    ├── knowledge/route.ts
    └── [toolId]/
        ├── route.ts
        └── analyze/route.ts
            └── Custom tools, integrations, project tools, Playground connections, and analysis

    lib/integrations/
    ├── access.ts
    ├── catalog.ts
    ├── install.ts
    ├── monitor.ts
    ├── project-tools.ts
    ├── registry.ts
    ├── runtime.ts
    ├── store.ts
    ├── templates.ts
    └── transport.ts
        └── Catalog access, credentials, tool execution, and documentation

    lib/
    ├── agent-project-tools.ts
    ├── builtin-project-tool-settings.ts
    └── tool-knowledge.ts
        └── Project tool configuration and capability summaries

    db/migrations/
    ├── 0060_integration_catalog.sql
    ├── 0061_custom_integrations_and_project_tools.sql
    ├── 0062_builtin_project_tool_settings.sql
    ├── 0068_playground_tools.sql
    ├── 0069_playground_tool_sharing.sql
    ├── 0070_integration_role_sharing.sql
    └── 0072_manager_integration_sharing.sql
        └── Integration, project-tool, Playground-tool, and role-sharing state

Tool Library combines custom HTTPS tools, integrations, and project tools. Credentials are handled by server-side integration settings; a catalog entry does not mean a third-party service is connected. Write actions use preview and confirmation safeguards. Manager/User/Employee access depends on role sharing and tool permissions.

~~~mermaid
flowchart TD
    A[Open Tool Library] --> B[Load permitted tools and catalogs]
    B --> C{Choose tool area}
    C -->|Custom tool| D[Create or edit endpoint definition]
    C -->|Integration| E[Configure or select a service connection]
    C -->|Project tool| F[Select built-in project capability]
    D --> G[Save and analyze tool description]
    E --> H[Keep credentials in server-side settings]
    F --> I[Load organization project-tool settings]
    G --> J[Expose only tools allowed to member/agent]
    H --> J
    I --> J
~~~

---

## Knowledge Management Page — file locations

**View:** Knowledge Management · **Route:** /dashboard/knowledge-management

    app/dashboard/
    ├── [section]/page.tsx
    └── _components/
        ├── AgentStudio.tsx
        ├── WorkspaceSections.tsx
        │   └── Knowledge page and tool-to-knowledge synchronization
        └── ToolLibraryKnowledge.tsx
            └── Knowledge entries and configuration status

    app/api/tools/
    ├── route.ts
    ├── knowledge/route.ts
    └── [toolId]/analyze/route.ts
        └── Lists tool knowledge and generates capability summaries

    lib/
    ├── tool-knowledge.ts
    ├── integrations/catalog.ts
    ├── integrations/project-tools.ts
    └── integrations/store.ts
        └── Builds sanitized knowledge from tool/integration configuration

    db/migrations/
    ├── 0060_integration_catalog.sql
    ├── 0061_custom_integrations_and_project_tools.sql
    ├── 0068_playground_tools.sql
    └── 0069_playground_tool_sharing.sql
        └── Tool definitions and related knowledge/configuration state

Knowledge Management documents capabilities from configured integrations and tools. Missing or unconfigured details remain undocumented; credentials and private API responses are excluded. This is not the organization HR document repository used by ePACE.

~~~mermaid
flowchart TD
    A[Open Knowledge Management] --> B[Read tool and integration definitions]
    B --> C[Remove credentials and private response data]
    C --> D{Capability documented?}
    D -->|Yes| E[Show configured knowledge summary]
    D -->|No| F[Show NULL/undocumented status]
    E --> G[Search and inspect entries]
    F --> H[Open Tool Library to configure/document]
~~~

---

## General Instructions Page — file locations

**View:** General Instructions · **Route:** /dashboard/general-instructions

    app/dashboard/
    ├── [section]/page.tsx
    └── _components/
        ├── AgentStudio.tsx
        └── WorkspaceSections.tsx
            └── General Instructions editor, character count, and rich text controls

    app/api/playground/state/route.ts
    └── Loads/saves Playground settings, including workspace instructions

    lib/
    ├── playground-behavior.ts
    └── playground-messages.ts
        └── Applies shared guidance to Playground requests

    db/migrations/
    ├── 0001_app_data.sql
    ├── 0002_workspace_features.sql
    └── 0007_token_calculator_state.sql
        └── Workspace and per-member Playground state storage

This page edits reusable Playground system guidance. It affects Playground behavior; it does not replace individual agent instructions or workflow settings in Agent Builder.

~~~mermaid
flowchart TD
    A[Open General Instructions] --> B[Load saved Playground settings]
    B --> C[Edit and format workspace guidance]
    C --> D[Save settings]
    D --> E[Persist through /api/playground/state]
    E --> F[Playground reads guidance on future requests]
~~~

---

## Models Page — file locations

**View:** Models · **Route:** /dashboard/models

    app/dashboard/
    ├── [section]/page.tsx
    └── _components/
        ├── AgentStudio.tsx
        └── WorkspaceSections.tsx
            └── Model catalog, compatibility notes, and refresh control

    app/api/playground/models/route.ts
    └── Lists models available through the configured OpenAI connection

    lib/
    ├── playground-models.ts
    └── model-pricing.ts
        └── Model compatibility and pricing metadata

Models listed for the configured API key and supported text Responses API are shown here. A listing does not guarantee generation permission or quota. This catalog is separate from the model selected on an individual agent.

~~~mermaid
flowchart TD
    A[Open Models] --> B[Request model catalog]
    B --> C[Filter for app-compatible text models]
    C --> D[Display IDs and pricing metadata]
    D --> E{Refresh list}
    E -->|Yes| B
~~~

---

## Settings Page — file locations

**View:** Settings · **Route:** /dashboard/settings

    app/dashboard/
    ├── [section]/page.tsx
    └── _components/
        ├── AgentStudio.tsx
        ├── WorkspaceSections.tsx
        │   └── Account settings page and profile/session panels
        └── ProfileImageEditor.tsx
            └── Profile image control

    components/auth/
    └── WorkspaceUserMenu.tsx
        └── Account identity/menu used throughout the signed-in workspace

    app/api/
    ├── account/profile/route.ts
    ├── account/sessions/route.ts
    ├── account/export/route.ts
    └── workspace/admin/password/route.ts
        └── Profile, sessions, account export, and Admin-managed password actions

    lib/
    ├── auth.ts
    ├── auth-client.ts
    ├── workspace-member-password.ts
    └── workspace-member-deletion.ts
        └── Authentication and account security logic

    db/migrations/
    ├── 0001_app_data.sql
    └── 0005_account_profile_media.sql
        └── User records and profile media

Settings is available to every active signed-in role. Profile and account actions apply to the signed-in member; Admin password resets are managed through Administration.

~~~mermaid
flowchart TD
    A[Open Settings] --> B[Load profile and session list]
    B --> C{Choose settings area}
    C -->|Personal details| D[Update own profile and image]
    C -->|Password/security| E[Review sessions or change permitted password]
    C -->|Information/privacy| F[Export account data or manage options]
    D --> G[Validate and save profile]
    E --> H[Apply authenticated security action]
    F --> I[Return permitted account data]
~~~

---

## Usage Page — file locations

**View:** Usage · **Route:** /dashboard/usage

    app/dashboard/
    ├── [section]/page.tsx
    └── _components/
        ├── AgentStudio.tsx
        ├── WorkspaceSections.tsx
        │   └── Mounts model usage view
        └── ModelUsageView.tsx
            └── Date-range totals, estimated cost, ticket equivalents, recent activity

    app/api/usage/route.ts
    └── Returns the signed-in member's recorded model usage

    lib/
    ├── model-usage.ts
    ├── model-pricing.ts
    └── openai-pricing.json
        └── Usage normalization, cost calculations, and model price metadata

    db/migrations/
    ├── 0025_usage_details.sql
    └── 0026_playground_completed_turns.sql
        └── Detailed usage and completed Playground turns

Usage displays recorded model requests and estimates based on available price data. It is member-scoped; missing or unpriced model data is identified and excluded from estimated charges rather than treated as zero-cost usage.

~~~mermaid
flowchart TD
    A[Open Usage] --> B[Select reporting period]
    B --> C[GET /api/usage?days=...]
    C --> D[Load member-scoped usage records]
    D --> E[Aggregate tokens and requests]
    D --> F[Apply available model prices]
    E --> G[Show totals and recent activity]
    F --> G
    F --> H[Mark unavailable/incomplete price data]
~~~

---

## Token Calculator Page — file locations

**View:** Token Calculator · **Route:** /dashboard/token-calculator

    app/dashboard/
    ├── [section]/page.tsx
    └── _components/
        ├── AgentStudio.tsx
        ├── WorkspaceSections.tsx
        └── TokenCalculatorView.tsx
            └── Input editor, model selector, estimates, reply-size comparison, actual usage

    app/api/token-calculator/
    ├── count/route.ts
    │   └── Counts entered text through the configured OpenAI connection
    └── state/route.ts
        └── Loads and saves member-specific calculator text/model/options

    app/api/playground/models/route.ts
    └── Supplies model choices

    app/api/usage/route.ts
    └── Supplies recorded usage for the actual-usage view

    lib/
    ├── model-usage.ts
    └── model-pricing.ts
        └── Shared usage and pricing calculations

    db/migrations/
    ├── 0007_token_calculator_state.sql
    └── 0067_live_token_calculator.sql
        └── Per-member calculator state and selected model/reply settings

“Before a run” counts text and estimates cost; it does not run Playground or generate an answer. “After a run” reads recorded model usage. Calculator state is saved per member.

~~~mermaid
flowchart TD
    A[Open Token Calculator] --> B[Load saved text and model]
    B --> C[Choose model and enter exact input]
    C --> D[Count input tokens]
    D --> E[Estimate cost and optional reply size]
    E --> F{Select actual usage?}
    F -->|Yes| G[Load completed model usage]
    F -->|No| H[Continue editing calculator input]
~~~

---

## Payments Page — file locations

**View:** Payments · **Route:** /dashboard/payments

    app/dashboard/
    ├── [section]/page.tsx
    └── _components/
        ├── AgentStudio.tsx
        ├── WorkspaceSections.tsx
        ├── PaymentsView.tsx
        ├── MembershipPlans.tsx
        └── PaymentRefundReview.tsx
            └── Ticket top-up, membership, payment integration, and Admin review UI

    app/api/payments/
    ├── route.ts
    ├── configuration/route.ts
    ├── orders/route.ts
    ├── callback/route.ts
    ├── webhook/route.ts
    ├── memberships/route.ts
    └── review/route.ts
        └── Payment config, checkout lifecycle, membership, webhook, and review APIs

    lib/
    ├── payments.ts
    ├── payment-provider.ts
    ├── payment-http.ts
    ├── payment-review.ts
    ├── membership-plans.ts
    ├── memberships.ts
    └── tickets.ts
        └── Provider integration, membership rules, and ticket balance logic

    db/migrations/
    ├── 0033_ticket_wallets.sql
    ├── 0034_daily_ticket_policy.sql
    ├── 0063_razorpay_payments.sql
    ├── 0064_payment_review.sql
    ├── 0065_membership_billing.sql
    └── 0066_payment_launch_controls.sql
        └── Ticket wallet, pricing, payment, membership, and launch-control state

All active roles can open their billing page. Admins have unlimited tickets; other roles may receive role-based allowances. Checkout only works when Admin payment configuration is ready and checkout is enabled. Admin payment/refund review is available through Administration.

~~~mermaid
flowchart TD
    A[Open Payments] --> B[Load member balance and payment configuration]
    B --> C{Choose payment action}
    C -->|Ticket top-up| D[Choose ticket package]
    C -->|Membership| E[Review available plan]
    D --> F{Checkout configured and enabled?}
    E --> F
    F -->|Yes| G[Create order/checkout]
    G --> H[Verify callback or webhook]
    H --> I[Update wallet or membership]
    F -->|No| J[Show checkout unavailable]
~~~

---

## Agent Workflow Builder Page — file locations

**Page:** Workflow Builder · **Route:** /agent-builder/{agentId}

    app/agent-builder/
    ├── layout.tsx
    │   └── Requires a signed-in session
    ├── [agentId]/page.tsx
    │   └── Opens the visual workflow builder
    ├── WorkflowBuilder.tsx
    │   └── React Flow canvas, editing, save, import/export, publish, and preview controls
    ├── _components/
    │   ├── Header.tsx
    │   ├── AgentToolsPanel.tsx
    │   ├── ActualToolLibrary.tsx
    │   ├── DraggableToolPanel.tsx
    │   ├── SettingPanel.tsx
    │   ├── StudioPicker.tsx
    │   └── StudioSettings.tsx
    ├── _costumNodes/
    │   ├── workflow-node-types.ts
    │   ├── ActualNodes.tsx
    │   ├── StartNode.tsx
    │   ├── AgentNode.tsx
    │   ├── ApiNode.tsx
    │   ├── IfElseNode.tsx
    │   ├── WhileNode.tsx
    │   ├── UserApprovalNode.tsx
    │   └── EndNode.tsx
    └── _nodeSettings/
        ├── AgentSettings.tsx
        ├── ApiSettings.tsx
        ├── IfElseSettings.tsx
        ├── WhileSettings.tsx
        ├── UserApproval.tsx
        └── EndSettings.tsx

    app/api/agents/[agentId]/
    ├── route.ts
    ├── workflow/route.ts
    ├── run/route.ts
    ├── publish/route.ts
    ├── studio-backup/route.ts
    └── share/route.ts
        └── Agent details, graph persistence/execution, publish, backup, and sharing

    lib/
    ├── workflow-graph.ts
    ├── workflow-store.ts
    ├── agent-flow.ts
    ├── agent-studio-graph.ts
    ├── agent-studio-runtime.ts
    ├── agent-studio-presets.ts
    └── agent-tool-input.ts
        └── Graph normalization, persistence, execution, and tool runtime

    db/migrations/
    ├── 0001_app_data.sql
    ├── 0003_agent_api_credentials.sql
    ├── 0048_agent_tool_approvals.sql
    └── 0049_agent_studio_backups.sql
        └── Agent/workflow data, credential safety, tool approvals, and backups

The builder edits the saved agent workflow graph. Tool writes and approval nodes are subject to server-side validation and required confirmation. Available operations depend on configured and permitted tools; node types do not limit the number of integrations.

~~~mermaid
flowchart TD
    A[Select Configure on an agent] --> B[Open workflow builder]
    B --> C[Load agent and saved graph]
    C --> D[Edit nodes, settings, and connections]
    D --> E{Builder action}
    E -->|Save| F[Validate and persist graph]
    E -->|Preview| G[Open agent preview]
    E -->|Publish/share| H[Validate access and publication settings]
    H --> I[Save permitted snapshot/access]
~~~

---

## Agent Preview Page — file locations

**Page:** Agent Preview · **Route:** /agent-builder/{agentId}/preview

    app/agent-builder/[agentId]/preview/page.tsx
    └── Loads the saved agent and workflow for interactive preview

    app/agent-builder/WorkflowBuilder.tsx
    └── Opens preview from the builder's preview action

    app/api/agents/[agentId]/
    ├── route.ts
    ├── workflow/route.ts
    └── run/route.ts
        └── Loads agent/graph, runs a message, and processes approvals

    lib/
    ├── workflow-graph.ts
    ├── workflow-store.ts
    ├── agent-flow.ts
    ├── agent-studio-runtime.ts
    └── agent-studio-charts.ts
        └── Preview graph, execution, traces, and charts

Preview runs the configured agent against test messages. It displays tool/workflow traces and approval requests returned by the runtime. A write operation is not complete until required approval is handled.

~~~mermaid
flowchart TD
    A[Open Agent Preview] --> B[Load agent and workflow graph]
    B --> C[Enter a test message]
    C --> D[POST /api/agents/{agentId}/run]
    D --> E[Execute configured workflow]
    E --> F{Tool approval required?}
    F -->|Yes| G[Show approval request and collect decision]
    G --> H[Resume or reject approved action]
    F -->|No| I[Return response]
    H --> I
    I --> J[Show answer, trace, and charts]
~~~

---

## Shared Agent Chat Page — file locations

**Page:** Shared Agent Preview · **Route:** /agent-builder/{agentId}/shared

    app/agent-builder/[agentId]/shared/page.tsx
    └── Shared-agent chat interface for an authorized recipient

    app/dashboard/_components/AgentManager.tsx
    └── Opens shared-agent preview from an agent card

    app/api/agents/[agentId]/
    ├── shared/route.ts
    └── share/route.ts
        └── Validates shared access and returns a recipient-safe agent snapshot

    lib/
    ├── agent-sharing.ts
    ├── agent-secrets.ts
    └── agent-store.ts
        └── Checks recipient scope and excludes private credentials

    db/migrations/
    ├── 0051_agent_role_shares.sql
    ├── 0071_agent_sharing_admin_recipient.sql
    ├── 0073_employee_agent_recipients.sql
    ├── 0074_user_agent_copies.sql
    ├── 0075_manager_agent_recipients.sql
    └── 0076_scoped_agent_roles.sql
        └── Role-aware sharing, recipient copies, and scoped access

Shared preview grants only access configured by the owner and verified by the server. It is preview-only; a recipient does not gain ownership or builder access just by opening the chat.

~~~mermaid
flowchart TD
    A[Recipient opens shared-agent link] --> B[GET /api/agents/{agentId}/shared]
    B --> C{Recipient allowed by share scope?}
    C -->|No| D[Show access error]
    C -->|Yes| E[Show safe agent summary]
    E --> F[Submit chat message]
    F --> G[POST /api/agents/{agentId}/shared]
    G --> H[Run shared preview without exposing credentials]
    H --> I[Display response and charts]
~~~

---

## Published Agent Chat endpoint — file locations

**Page/endpoint:** Published Agent Chat · **Route:** /api/published-agents/{publicId}/chat

    app/api/published-agents/[publicId]/chat/route.ts
    └── Public chat endpoint for an active published agent snapshot

    app/agent-builder/WorkflowBuilder.tsx
    └── Publication controls and generated endpoint usage example

    app/api/agents/[agentId]/publish/route.ts
    └── Creates, updates, or disables an agent publication

    lib/
    ├── workflow-store.ts
    ├── workflow-graph.ts
    ├── agent-flow.ts
    ├── agent-studio-runtime.ts
    └── agent-secrets.ts
        └── Published snapshots, execution, and credential filtering

    db/migrations/0049_agent_studio_backups.sql
    └── Agent publication and backup state

Only an active published snapshot is available through the public endpoint. Publication does not expose the owner's private API credentials. Availability and external-tool configuration depend on server setup.

~~~mermaid
flowchart TD
    A[Owner publishes agent] --> B[Validate publication and snapshot]
    B --> C[Save active public version]
    D[Client sends chat message] --> E[POST published chat endpoint]
    E --> F{Publication active?}
    F -->|No| G[Reject request]
    F -->|Yes| H[Load public snapshot]
    H --> I[Run with server-side credential protections]
    I --> J[Return reply and conversation identifier]
~~~

---

## Templates Page — file locations

**Page:** Templates · **Route:** /dashboard/templates

    app/dashboard/templates/page.tsx
    └── Currently redirects to /dashboard; it is not a standalone Templates gallery

    app/dashboard/_components/
    ├── AgentManager.tsx
    └── StudioStarters.tsx
        └── Agent creation templates/starters exposed in current Agent Studio flows

    app/api/agents/
    ├── studio-templates/route.ts
    └── integration-templates/route.ts
        └── Supplies agent and integration templates where used

The Templates route currently redirects to Playground. Reusable starters/templates are exposed within the active Agent Studio flows; this route does not render a separate template page.

~~~mermaid
flowchart TD
    A[Open /dashboard/templates] --> B[Redirect to /dashboard]
    B --> C[Open Playground]
    C --> D[Choose an available starter/template]
    D --> E[Use it in the relevant Agent Studio flow]
~~~

---

## Shared workspace links and notifications — file locations

These are shared shell features rather than separate Agent Studio navigation pages.

    app/dashboard/_components/
    ├── AgentStudio.tsx
    │   └── Role-filtered Review Center/ePACE cards and shell mounting points
    ├── RequestNotifications.tsx
    │   └── Request notification refresh and navigation
    └── MeetingInvitations.tsx
        └── Meeting invitation notification refresh and navigation

    app/api/workspace/
    ├── request-notifications/route.ts
    ├── requests/route.ts
    └── access/route.ts
        └── Member role, request notification, and access state

    app/api/epace/
    └── route.ts and related chat, documents, readiness, events, and moderation endpoints
        └── Employee knowledge workspace APIs

    lib/
    ├── workspace-navigation-recovery.ts
    ├── request-notifications.ts
    └── workspace-permissions.ts
        └── Role-aware destinations and notification rules

The Review Center card is shown for Admin/Manager operations access. The ePACE card is shown for an Employee and is usable after employment verification. Request and meeting notifications navigate to the member's permitted destination.

~~~mermaid
flowchart TD
    A[Render shared shell] --> B[Check role and permissions]
    B --> C{Workspace shortcut}
    C -->|Admin or Manager| D[Offer Review Center]
    C -->|Employee| E[Offer ePACE with verification state]
    B --> F[Poll request and meeting notifications]
    F --> G[Open permitted request or meeting page]
~~~

---

## Shared Agent Studio data and execution flow

    Browser page
      → app/dashboard/_components/AgentStudio.tsx
      → role-aware page component
      → authenticated app/api route
      → lib access/prompt/runtime helpers
      → PostgreSQL, configured model, or permitted integration
      → response returned to the page

    Agent workflow
      → app/agent-builder/WorkflowBuilder.tsx
      → POST /api/agents/{agentId}/workflow
      → lib/workflow-store.ts and lib/workflow-graph.ts
      → PostgreSQL workflow graph
      → POST /api/agents/{agentId}/run for preview/execution

    Playground chat
      → app/dashboard/_components/PlaygroundView.tsx
      → POST /api/playground
      → lib/playground-response.ts and lib/playground-tool-runtime.ts
      → role-allowed configured tools
      → saved member state and rendered answer

These flows are separate: Playground is the role-aware workspace assistant; Agents stores configurable agent definitions; Agent Workflow Builder edits a graph; Preview tests that saved agent; Shared Agent Chat and Published Agent Chat use their own access models.

