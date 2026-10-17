// Shared, non-secret configuration metadata for the setup UI and agent tools.
export type SetupField = {
    key: string;
    label: string;
    secret?: boolean;
    optional?: boolean;
    placeholder?: string;
};
export type Operation = {
    id: string;
    label: string;
    method: string;
    path: string;
    write?: boolean;
    run?: boolean;
    example?: Record<string, unknown>;
    target?: string;
    form?: Record<string, string>;
    contentType?: string;
    headers?: Record<string, string>;
};
export type Provider = {
    id: string;
    name: string;
    category: string;
    description: string;
    auth: "aws" | "azure" | "basic" | "bearer" | "none" | "mapped" | "oauth2";
    fields: SetupField[];
    operations: Operation[];
    docs: string;
    custom?: boolean;
    reuse?: string;
    adapter?: string;
};
const field = (key: string, label: string, secret = false, optional = false): SetupField => ({
    key,
    label,
    secret,
    optional,
});
const op = (
    id: string,
    label: string,
    path: string,
    extra: Partial<Operation> = {},
): Operation => ({ id, label, path, method: "GET", ...extra });
const aws = [
    field("region", "AWS region"),
    field("accessKeyId", "Access key ID", true),
    field("secretAccessKey", "Secret access key", true),
    field("sessionToken", "Session token (temporary credentials)", true, true),
];
const azure = [
    field("tenantId", "Tenant ID"),
    field("clientId", "Application (client) ID"),
    field("clientSecret", "Client secret", true),
    field("subscriptionId", "Subscription ID"),
];
const basic = [
    field("baseUrl", "API base URL"),
    field("username", "Username / email"),
    field("password", "Password / API token", true),
];
const bearer = [field("baseUrl", "API base URL"), field("token", "API token", true)];
const mapped = [...bearer, field("mapping", "Operation mappings (JSON)")];
export const integrationCatalog: Provider[] = [
    {
        id: "dnr_mail",
        name: "DNR Mail Notifications",
        category: "Email",
        auth: "none",
        fields: [],
        description:
            "Project email notifications using the existing encrypted mail queue. DNR is the demo label; no separate DNR vendor is assumed. Queueing is not proof of delivery.",
        docs: "",
        operations: [
            op("status", "Read mail readiness", ""),
            op("send", "Queue notification", "", {
                method: "POST",
                write: true,
                example: { to: "recipient@example.com", subject: "Notification", text: "Message" },
            }),
        ],
    },
    {
        id: "connect",
        name: "Amazon Connect",
        category: "Voice & support",
        auth: "aws",
        fields: [...aws, field("instanceId", "Connect instance ID")],
        description: "Read contact-centre queues and contacts; initiate approved outbound calls.",
        docs: "https://docs.aws.amazon.com/connect/latest/APIReference/Welcome.html",
        operations: [
            op(
                "queues",
                "List queues",
                "/queues-summary/{instanceId}?queueTypes=STANDARD&maxResults=100",
            ),
            op("contact", "Read contact", "/contacts/{instanceId}/{contactId}", {
                example: { contactId: "contact-id" },
            }),
            op("call", "Start outbound voice contact", "/contact/outbound-voice", {
                method: "PUT",
                write: true,
                run: true,
                example: {
                    body: {
                        InstanceId: "instance-id",
                        ContactFlowId: "flow-id",
                        DestinationPhoneNumber: "+15555550100",
                        SourcePhoneNumber: "+15555550101",
                        ClientToken: "unique-request-id",
                    },
                },
            }),
        ],
    },
    {
        id: "lambda",
        name: "AWS Lambda",
        category: "Cloud & automation",
        auth: "aws",
        fields: aws,
        description: "Discover functions and invoke a chosen function after review.",
        docs: "https://docs.aws.amazon.com/lambda/latest/api/welcome.html",
        operations: [
            op("functions", "List functions", "/2015-03-31/functions/?MaxItems=50"),
            op("invoke", "Invoke function", "/2015-03-31/functions/{functionName}/invocations", {
                method: "POST",
                write: true,
                run: true,
                example: { functionName: "my-function", body: {} },
            }),
        ],
    },
    {
        id: "ses",
        name: "AWS SES",
        category: "Email",
        auth: "aws",
        fields: aws,
        description: "Check sending status and send email from a verified SES identity.",
        docs: "https://docs.aws.amazon.com/ses/latest/APIReference-V2/Welcome.html",
        operations: [
            op("account", "Read sending account", "/v2/email/account"),
            op("send", "Send email", "/v2/email/outbound-emails", {
                method: "POST",
                write: true,
                example: {
                    body: {
                        FromEmailAddress: "verified@example.com",
                        Destination: { ToAddresses: ["recipient@example.com"] },
                        Content: {
                            Simple: {
                                Subject: { Data: "Notification" },
                                Body: { Text: { Data: "Message" } },
                            },
                        },
                    },
                },
            }),
        ],
    },
    {
        id: "cost",
        name: "AWS Cost Explorer",
        category: "Cloud & automation",
        auth: "aws",
        fields: aws,
        description: "Read actual daily AWS costs for an explicit billing period.",
        docs: "https://docs.aws.amazon.com/aws-cost-management/latest/APIReference/API_GetCostAndUsage.html",
        operations: [
            op("costs", "Get cost and usage", "/", {
                method: "POST",
                target: "AWSInsightsIndexService.GetCostAndUsage",
                example: {
                    body: {
                        TimePeriod: { Start: "2026-10-01", End: "2026-10-14" },
                        Granularity: "DAILY",
                        Metrics: ["UnblendedCost"],
                    },
                },
            }),
        ],
    },
    {
        id: "ec2",
        name: "AWS EC2",
        category: "Cloud & automation",
        auth: "aws",
        fields: aws,
        description: "Read EC2 inventory and start or stop specified lab instances.",
        docs: "https://docs.aws.amazon.com/AWSEC2/latest/APIReference/Welcome.html",
        operations: [
            op("instances", "Describe instances", "/", {
                method: "POST",
                form: { Action: "DescribeInstances", Version: "2016-11-15", MaxResults: "50" },
            }),
            ...["Start", "Stop"].map((action) =>
                op(action.toLowerCase(), `${action} instance`, "/", {
                    method: "POST",
                    write: true,
                    run: true,
                    form: {
                        Action: `${action}Instances`,
                        Version: "2016-11-15",
                        "InstanceId.1": "{instanceId}",
                    },
                    example: { instanceId: "i-example" },
                }),
            ),
        ],
    },
    {
        id: "entra",
        name: "Azure AD / Entra ID",
        category: "Identity",
        auth: "azure",
        fields: azure.filter((f) => f.key !== "subscriptionId"),
        description:
            "Read directory users and groups using explicitly granted Microsoft Graph permissions.",
        docs: "https://learn.microsoft.com/en-us/graph/api/overview",
        operations: [
            op(
                "users",
                "List directory users",
                "/v1.0/users?$top=50&$select=id,displayName,mail,userPrincipalName,accountEnabled",
            ),
            op("groups", "List directory groups", "/v1.0/groups?$top=50&$select=id,displayName"),
            op("user", "Read user", "/v1.0/users/{userId}", {
                example: { userId: "user-object-id" },
            }),
        ],
    },
    {
        id: "azure_vm",
        name: "Azure VM",
        category: "Cloud & automation",
        auth: "azure",
        fields: azure,
        description: "Read subscription VM inventory and start or deallocate a selected lab VM.",
        docs: "https://learn.microsoft.com/en-us/rest/api/compute/virtual-machines",
        operations: [
            op(
                "vms",
                "List virtual machines",
                "/subscriptions/{subscriptionId}/providers/Microsoft.Compute/virtualMachines?api-version=2025-04-01",
            ),
            ...["start", "deallocate"].map((action) =>
                op(
                    action,
                    `${action === "start" ? "Start" : "Deallocate"} virtual machine`,
                    `/subscriptions/{subscriptionId}/resourceGroups/{resourceGroup}/providers/Microsoft.Compute/virtualMachines/{vmName}/${action}?api-version=2025-04-01`,
                    {
                        method: "POST",
                        write: true,
                        run: true,
                        example: { resourceGroup: "lab", vmName: "my-vm" },
                    },
                ),
            ),
        ],
    },
    {
        id: "azure_automation",
        name: "Autonomics Azure Tools",
        category: "Cloud & automation",
        auth: "azure",
        fields: [
            ...azure,
            field("resourceGroup", "Automation resource group"),
            field("automationAccount", "Automation account name"),
        ],
        description:
            "List Azure Automation runbooks and submit approved runbook jobs. A documented implementation of Azure automation, not a claim about the demo's private tool.",
        docs: "https://learn.microsoft.com/en-us/rest/api/automation/",
        operations: [
            op(
                "runbooks",
                "List runbooks",
                "/subscriptions/{subscriptionId}/resourceGroups/{resourceGroup}/providers/Microsoft.Automation/automationAccounts/{automationAccount}/runbooks?api-version=2023-11-01",
            ),
            op(
                "job",
                "Create runbook job",
                "/subscriptions/{subscriptionId}/resourceGroups/{resourceGroup}/providers/Microsoft.Automation/automationAccounts/{automationAccount}/jobs/{jobId}?api-version=2023-11-01",
                {
                    method: "PUT",
                    write: true,
                    run: true,
                    example: {
                        jobId: "new-uuid",
                        body: { properties: { runbook: { name: "runbook-name" }, parameters: {} } },
                    },
                },
            ),
        ],
    },
    {
        id: "confluence",
        name: "Confluence",
        category: "Knowledge",
        auth: "basic",
        fields: basic,
        description:
            "Read Confluence Cloud pages and spaces; create pages after review. Use your site origin as the base URL.",
        docs: "https://developer.atlassian.com/cloud/confluence/rest/v2/intro/",
        operations: [
            op("pages", "List pages", "/wiki/api/v2/pages?limit=25"),
            op("page", "Read page content", "/wiki/api/v2/pages/{pageId}?body-format=storage", {
                example: { pageId: "12345" },
            }),
            op("spaces", "List spaces", "/wiki/api/v2/spaces?limit=25"),
            op("create", "Create page", "/wiki/api/v2/pages", {
                method: "POST",
                write: true,
                example: {
                    body: {
                        spaceId: "space-id",
                        status: "current",
                        title: "New page",
                        body: { representation: "storage", value: "<p>Content</p>" },
                    },
                },
            }),
        ],
    },
    {
        id: "servicenow",
        name: "AEX-ServiceNow",
        category: "IT operations",
        auth: "basic",
        fields: basic,
        reuse: "servicenow",
        description:
            "Incident read, create, update and resolve operations. Reuse your existing ServiceNow connection without copying credentials.",
        docs: "https://developer.servicenow.com/dev.do#!/reference/api",
        operations: [
            op(
                "incidents",
                "List incidents",
                "/api/now/table/incident?sysparm_limit=25&sysparm_display_value=true&sysparm_fields=sys_id,number,short_description,state,priority,assigned_to,sys_updated_on",
            ),
            op("incident", "Read incident", "/api/now/table/incident/{sysId}", {
                example: { sysId: "incident-sys-id" },
            }),
            op("create", "Create incident", "/api/now/table/incident", {
                method: "POST",
                write: true,
                example: {
                    body: {
                        short_description: "Issue summary",
                        description: "Observed evidence",
                        impact: "3",
                        urgency: "3",
                    },
                },
            }),
            op("update", "Update / resolve incident", "/api/now/table/incident/{sysId}", {
                method: "PATCH",
                write: true,
                example: { sysId: "incident-sys-id", body: { work_notes: "Investigation update" } },
            }),
        ],
    },
    {
        id: "ansible",
        name: "Ansible / Semaphore",
        category: "Cloud & automation",
        auth: "bearer",
        fields: [...bearer, field("projectId", "Semaphore project ID")],
        reuse: "semaphore",
        description:
            "Read playbook templates and task history; launch a configured template after approval.",
        docs: "https://docs.semaphoreui.com/api/",
        operations: [
            op("templates", "List templates", "/api/project/{projectId}/templates"),
            op("tasks", "List recent tasks", "/api/project/{projectId}/tasks?count=25"),
            op("launch", "Launch template", "/api/project/{projectId}/tasks", {
                method: "POST",
                write: true,
                run: true,
                example: { body: { template_id: 1, debug: false, dry_run: true } },
            }),
        ],
    },
    {
        id: "bigfix",
        name: "AEX-BigFix",
        category: "IT operations",
        auth: "basic",
        fields: basic,
        description:
            "Read BigFix computers and actions. Submit explicitly reviewed action XML to your BigFix server.",
        docs: "https://developer.bigfix.com/rest-api/",
        operations: [
            op("computers", "List computers", "/api/computers"),
            op("actions", "List actions", "/api/actions"),
            op("action", "Submit action XML", "/api/actions", {
                method: "POST",
                write: true,
                run: true,
                example: { xml: "<BES><!-- Supply a valid BigFix action document --></BES>" },
            }),
        ],
    },
    {
        id: "qualys",
        name: "LAB Qualys",
        category: "Security",
        auth: "basic",
        fields: basic,
        description:
            "Read VM scans and host detections using your platform's Qualys API URL. Launch a configured VM scan after review. Web application scanning requires its own module and mapping.",
        docs: "https://www.qualys.com/docs/qualys-api-vmpc-user-guide.pdf",
        operations: [
            op("scans", "List VM scans", "/api/2.0/fo/scan/?action=list"),
            op(
                "detections",
                "List host detections",
                "/api/2.0/fo/asset/host/vm/detection/?action=list&truncation_limit=100",
            ),
            op("launch", "Launch VM scan", "/api/2.0/fo/scan/", {
                method: "POST",
                write: true,
                run: true,
                form: {
                    action: "launch",
                    scan_title: "{title}",
                    ip: "{targetIp}",
                    option_id: "{optionId}",
                },
                example: {
                    title: "Authorized lab scan",
                    targetIp: "your-owned-lab-ip",
                    optionId: "option-profile-id",
                },
            }),
        ],
    },
    {
        id: "aci",
        name: "Cisco ACI / BGP",
        category: "Networking",
        auth: "mapped",
        fields: [...mapped],
        custom: true,
        description:
            "Configure authenticated controller operations for your ACI version or an authorized lab gateway. Supply a session token header or gateway bearer token; never a browser cookie.",
        docs: "https://developer.cisco.com/docs/aci/",
        operations: [],
    },
    ...[
        [
            "armis",
            "Armis API",
            "Security",
            "Live asset and security data. Map the documented operations and authentication header for your tenant. The docs-only agent can run with indexed API documentation without this connection.",
            "https://www.armis.com/",
        ],
        [
            "systrack",
            "SysTrack",
            "IT operations",
            "Read endpoint telemetry and software inventory through your tenant's supported API. Requires a real enrolled test device for telemetry.",
            "https://documentation.lakesidesoftware.com/",
        ],
        [
            "cisco_bugs",
            "Cisco Bug Lookup",
            "Networking",
            "Map your authorized Cisco bug search API or lab gateway. Supply the API authentication supported by your access entitlement.",
            "https://developer.cisco.com/",
        ],
        [
            "soc",
            "SOC Cases & Alerts",
            "Security",
            "Connect your selected SOC platform's case and alert operations. The demo does not identify its backend clearly.",
            "",
        ],
        [
            "nre",
            "NRE Automation",
            "Networking",
            "Configure the NRE API operation contract available to you. The demo's private backend is not supplied.",
            "",
        ],
        [
            "iautomate",
            "iAutomate",
            "Cloud & automation",
            "Configure your automation platform's documented operations. This is a configurable adapter, not access to the demo's private service.",
            "",
        ],
    ].map(([id, name, category, description, docs]): Provider => ({
        id,
        name,
        category,
        description,
        docs,
        auth: "mapped",
        fields: mapped,
        operations: [],
        custom: true,
    })),
    {
        id: "azure_mcp",
        name: "AZURE! / MCP",
        category: "Cloud & automation",
        auth: "bearer",
        fields: [...bearer],
        description:
            "Connect a Streamable HTTP MCP endpoint. Discover tools; tool calls are reviewed as potentially changing operations.",
        docs: "https://modelcontextprotocol.io/specification/2025-03-26/basic/transports",
        operations: [
            op("tools", "Discover MCP tools", "", { method: "POST" }),
            op("call", "Call MCP tool", "", {
                method: "POST",
                write: true,
                run: true,
                example: { toolName: "tool-name", arguments: {} },
            }),
        ],
    },
    {
        id: "web",
        name: "Web Scraper",
        category: "Knowledge",
        auth: "none",
        fields: [field("baseUrl", "Website origin")],
        description:
            "Retrieve a page from an approved public website and return readable text. Does not execute JavaScript or bypass login.",
        docs: "",
        operations: [op("page", "Read web page", "/{path}", { example: { path: "" } })],
    },
];
export const providerById = (id: string) => integrationCatalog.find((p) => p.id === id);
export function integrationPurpose(provider: Provider) {
    return `${provider.description} Pass JSON {"operation":"operation-id","inputs":{...}}. Available operations: ${provider.operations.map((o) => `${o.id}: ${o.label}${o.write ? " (requires approval)" : ""}`).join("; ") || "configured mappings; use operation=capabilities to discover them"}. Use operation=capabilities to check setup. Never assume credentials are configured.`;
}
