# Agent and Tool Library reconstruction inventory

Checked on 18 October 2026 against the main project source and available conversation history.

## Aiven database initialization

Verified encrypted, certificate-validated access to `defaultdb`. Applied the authentication schema and all 78 application migration files. The public schema contains 106 tables. At the initial connection check, before account creation and reconstruction, there were no accounts and no saved agents. The new schema is ready; previous Railway records have not been recovered or imported.

## Reconstruction completed

The Admin account now has 32 rebuilt agents. See `AGENT-RECOVERY-REPORT.md` for the names, verification, and remaining gaps. The catalog includes 23 entries; six are generated from mapped definitions in source and were omitted by the original simple name scan: Armis API, SysTrack, Cisco Bug Lookup, SOC Cases & Alerts, NRE Automation, and iAutomate.

## What we can reconstruct from source

The definitions below retain names and purposes, and some include tool relationships and graph-building functions. They are recoverable starting definitions, not proof that we have the latest user-edited version of every former database record.

### Saved core agent presets and specialists

Source: `lib/agent-studio-presets.ts`.

- CyberOpsAgent
- ServiceNow Agent
- Database Activity Monitoring Agent
- Monitor
- Qualys Scan Agent
- IAM Agent
- DWP-MAIN-AGENT
- Systrack
- Software Inventory Agent
- MeetRoom
- Leave Management
- New Employee Onboarding
- ActionableAgent
- Incident Analysis Agent

### Integration agent templates

Source: `lib/integrations/templates.ts`.

- Ansible Agent
- Armis API Agent
- Assurance Agent
- ServiceNow New
- ServiceNowMonitorAgent
- SOC Agent
- Ansible Script Executer Agent
- BGP_Peers_Agent
- BugScrubberAgent
- L2_network_Agent
- NRE Ansible Agent
- Canada RFP - IVR
- AEX IVR Agent
- AEX-iAutomate Agent
- Qualys Scan Agent
- Cloud Operations Agent
- Identity Operations Agent
- Endpoint Operations Agent

### Integration catalog

Source: `lib/integrations/catalog.ts`.

- DNR Mail Notifications
- Amazon Connect
- AWS Lambda
- AWS SES
- AWS Cost Explorer
- AWS EC2
- Azure AD / Entra ID
- Azure VM
- Autonomics Azure Tools
- Confluence
- AEX-ServiceNow
- Ansible / Semaphore
- AEX-BigFix
- LAB Qualys
- Cisco ACI / BGP
- AZURE! / MCP
- Web Scraper

### Built-in project tools

Source: `lib/agent-project-tools.ts`.

- Meeting-room availability
- Agent Assist
- Chart Visualizer
- Security scan reports
- Service health
- ServiceNow incidents
- My profile
- My workplace requests

## Requirements retained in the available conversation

- Actual Agent uses a separate Integration catalog Tools panel, alongside Project Tools and Tool Library.
- Managers can share their own integrations with Admins, employees, and users, and forward eligible Admin-shared tools without sending the Admin's tool back to its owner.
- Shared integration recipients cannot delete the owner's integration; they can delete their own integrations.
- Employee agent sharing has role and department restrictions; selecting User reveals a user-ID entry field.
- User accounts share agents with specific other User accounts, not company staff. Editable copies must exclude source API credentials so recipients supply their own.
- Admin role-based sharing can cover present and future accounts in the selected role.

These are remembered requirements. The inventory does not claim that every implementation path was re-audited during this database connection change.

## Information still needed for an exact restore

Accounts and staff assignments, custom Tool Library definitions, changed prompts, edited node positions and connections, saved model choices, uploaded knowledge, API credentials, and individual sharing records may have existed only in the deleted database.

Check Railway's retained backups and any external database export first. The migrations and local application source are not a database backup. Workflow backup tables were also inside the database, so their contents require recovery of that database or an external export.

If no backup exists, use this inventory and the original materials you saved to rebuild. Do not create placeholder records and present them as recovered originals. Reconnect external services using fresh or retained credentials supplied through the application's secure settings.
