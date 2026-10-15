import type {WorkspaceAccess} from './workspace-permissions';
type Capability={name:string;group:string;href:string;instruction:string;commands?:string[]};
const admin='/dashboard/administration',review='/service-review-center',ops=review+'/eassist';
const item=(name:string,group:string,href:string,instruction:string,commands?:string[]):Capability=>({name,group,href,instruction,commands});
export const adminCapabilities:Capability[]=[
 item('Offer emails','Email',admin+'#mail-center','Ask naturally to prepare an employment offer. Answer the candidate and employment questions using buttons or typed details. The professional letter uses your saved template and Admin profile contact details; review and confirm before sending.',['Send offer email']),
 item('Email previews','Email',admin+'#mail-center','Start a guided offer letter to review its recipient, employment details and Admin contact information. Use Edit offer details or Cancel email before confirming.',['Send offer email']),
 item('Email status','Email',admin+'#mail-center','Ask whether your queued email was sent. The chatbot uses its message ID from the conversation, or asks for it. You can also review Mail Center. Queued, SMTP accepted and failed are different states.'),
 item('Test emails','Email',admin+'#mail-center','Use Send test to my email in Mail Center. This sends the delivery-test template to your signed-in email; it does not send an offer.'),
 item('Request approval','Requests','/dashboard/team-requests','Ask to approve a request and give its request number. Review and confirm the exact preview. Self-approval is blocked.',['Team requests']),
 item('Request rejection','Requests','/dashboard/team-requests','Ask to decline a request, giving its number and your reason. Review and confirm the preview.',['Team requests']),
 item('Request cancellation','Requests','/dashboard/team-requests','Ask to cancel a request and give its number, then confirm its preview. Only an eligible request can be cancelled.',['Team requests']),
 item('Request fulfilment','Requests','/dashboard/team-requests','Ask to record a request as fulfilled, giving its number and verified fulfilment evidence. Review and confirm. This records completed work; it does not perform external provisioning or bookings.',['Team requests']),
 item('Team requests','Requests','/dashboard/team-requests','Review workspace requests, their saved details and status. Admins can decide eligible requests from other accounts.'),
 item('Role assignment','People',admin,'Tell me which existing login should have which website role. Missing details are asked for. Review the exact account and confirm. Website roles remain User, Employee, Manager and Admin.',['Assign role']),
 item('Admin assignment','People',admin,'Ask to grant an existing login Admin access, then review and confirm the exact account. Admin grants full organization access.',['Assign role']),
 item('Account activation','People',admin,'Find the account, enable Active account, and Save member. This change is applied by the server and audited.'),
 item('Account deactivation','People',admin,'Find the account, disable Active account, and Save member. The last active Admin must remain.'),
 item('Account deletion','People',admin,'Use Delete account on the exact member and complete its confirmation. Deletion removes account data. Self-deletion, protected integration ownership and deleting the last Admin are restricted.'),
 item('Employment confirmation','People',admin,'Use Confirm employment on an Employee with a department and qualification. Manager and Admin roles do not require this step.'),
 item('Department creation','People',admin+'#staff-catalog','Ask to set up a company department and give its name. Review the name and confirm. The next department number is allocated on creation.',['Create department']),
 item('Qualification management','People',admin+'#staff-catalog','Open Staff catalog, choose Qualification, enter its full name and unique letter suffix, then add it. Assign the highest completed qualification to staff.'),
 item('Position management','People',admin+'#staff-catalog','Open Staff catalog, choose Company job title and its department, then add it. Company positions do not create new website access roles.'),
 item('Staff IDs','People',admin,'Assign a staff department and highest completed qualification. IDs use year, department number, E or M, department sequence and qualification suffix; Admins have separate Admin IDs.'),
 item('Manager assignment','People',admin,'Choose the reporting manager on the member card and Save member. This routes team approvals and requests.'),
 item('Ticket top-ups','People',admin,'Use Top up tickets on an Employee or Manager. This allocates company tickets without charging a payment method.'),
 item('Unlimited tickets','People',admin,'Admin accounts have unlimited tickets. Employees refill to 50 daily and Managers to 100; unused daily tickets do not accumulate.'),
 item('Recruitment publishing','People',admin+'#organization-controls','Open Recruitment in Organization controls to publish or update positions. Fresh Users can see published vacancies.'),
 item('Organization controls','People',admin+'#organization-controls','Choose the shared integration owner and account request limit. Save organization controls to apply the organization policy.'),
 item('Security policies','Security',ops+'?view=security','Review and update the shared eAssist policy. Organization protection applies to every account; controls remain Admin-only.'),
 item('Security scans','Security',review+'/vulnerability-reports','Configure a supported scanner, run a scan and review its job status. Scanner workers and required credentials must be available.'),
 item('Security reports','Security',review+'/vulnerability-reports','Open saved findings and evidence; export available reports. Missing or failed scans are not proof of a secure system.'),
 item('Organization alerts','Security',ops+'?view=alerts','View organization alerts grouped by account and ID, with active, acknowledged or resolved status. All Admins use the shared organization view.'),
 item('Alert acknowledgement','Security',ops+'?view=alerts','Open an active alert and choose Acknowledge. Acknowledgement does not fix or resolve the underlying issue.'),
 item('Alert resolution','Security',ops+'?view=alerts','Resolve eligible platform alerts with evidence. Vulnerability findings require scanner evidence; source alerts follow their source lifecycle.'),
 item('Alert history','Security',ops+'?view=alerts','Review the alert lifecycle and include inactive/resolved records to see earlier status changes.'),
 item('Audit activity','People',admin+'#audit-activity','Review recorded member, request, catalog and organization changes with their actual actor and timestamp.'),
 item('Integration management','Operations',ops+'?view=integrations','Configure supported organization integrations, verify their connection state, and enable collection. Secrets belong in the secure configuration fields.'),
 item('Agent management','Agent Studio','/dashboard/agents','Create, edit and configure your agents and workflows. Agent runs require configured models, tools and permitted execution.'),
 item('Tool management','Agent Studio','/dashboard/tool-library','Manage your tool definitions and attach permitted tools to agents.'),
 item('Knowledge management','Agent Studio','/dashboard/knowledge-management','Add and maintain your knowledge sources for agents.'),
 item('Model selection','Agent Studio','/dashboard/models','Choose a verified supported model. Provider access and credentials are required to run paid models.'),
 item('Usage tracking','Agent Studio','/dashboard/usage','Review recorded model usage and token consumption.'),
 item('Token calculator','Agent Studio','/dashboard/token-calculator','Estimate token usage and model cost. Estimates are not a provider invoice.'),
 item('Payment access','Agent Studio','/dashboard/payments','Admins and Users can open Payments. Razorpay checkout is not implemented yet; displayed plans do not prove payment processing.'),
 item('Review Center','Review Center',review,'Open the shared organization overview. Admins and Managers use the same overview readings; eAssist remains Admin-only.'),
 item('Observability','Review Center',review+'?view=observability','Review monitored health and availability from organization readings. Missing or stale readings are not counted as verified healthy.'),
 item('Value dashboard','Review Center',review+'?view=value','Review source-defined business metrics and their timestamps. Demo readings are examples, not verified outcomes.'),
 item('AI Ops','Review Center',review+'?view=aiops','Review stored automation tasks and outcomes. Automation requires a connected task source.'),
 item('Executive summary','Review Center',review+'?view=executive','Review the organization summary from available operational and business readings.'),
 item('Data sources','Review Center',review+'?view=sources','Review source health and coverage, configure collection, or import readings.'),
 item('Geo health','Review Center',review+'?view=geo','Review endpoint geography and health. IP location can represent a proxy or CDN; private addresses cannot be publicly geolocated.'),
 item('Service details','Review Center',review+'?view=details','Read the service catalog description and open its related dashboard. Viewing a service does not provision infrastructure.'),
 item('Data imports','Review Center',review+'?view=sources','Import a JSON batch with a fresh UUID batchId and documented records. Never put the collector token in batchId.'),
 item('Collector tokens','Review Center',review+'?view=sources','Create, replace or revoke a collector token through Data sources. It permits scoped ingestion, not report reading or automation. Keep the token private.'),
 item('ePACE access','Review Center',review+'/epace','Open ePACE for its knowledge and workflow workspace.'),
 item('eAssist access','Operations',ops,'Open the shared Admin operations workspace. Managers, Employees and Users cannot access eAssist.'),
 item('Automated alerts','Security',ops+'?view=automated-alerts','Review organization security findings and scan alerts shared across all Admins. The server worker runs independently of login and page visits; the feed refreshes every five seconds. Actual scanning depends on configured scanners, an enabled schedule and a running worker host.'),
 item('Alert silences','Operations',ops+'?view=silences','Create or manage time-bound silences through the connected Alertmanager. Silencing suppresses notifications; it does not resolve an alert.'),
 item('Incident management','Operations',ops+'?view=incidents','Review and manage incidents through a configured ServiceNow connection. No connected ServiceNow means no external incident creation.'),
 item('Operations dashboard','Operations',ops+'?view=dashboard','Review the shared operations dashboard from connected sources.'),
 item('Task templates','Operations',ops+'?view=templates','Review and run connected automation playbooks when execution is allowed by the organization policy.'),
 item('Automation schedules','Operations',ops+'?view=schedules','Manage schedules through the supported automation integration. A connected source and permitted changes are required.'),
 item('Inventory management','Operations',ops+'?view=inventory','Review or manage inventory through the connected automation source.'),
 item('Variable groups','Operations',ops+'?view=environment','Manage environment/variable groups through the connected automation source. Keep secrets in secure fields.'),
 item('Key Store','Operations',ops+'?view=keys','Manage protected automation keys through the connected source. Playground must not display secret values.'),
 item('Repository management','Operations',ops+'?view=repositories','Review or configure repositories through the connected automation source.'),
 item('Team management','Operations',ops+'?view=users','Manage the connected operations team here. Company account roles and reporting managers are managed in Administration.'),
 item('Activity monitoring','Operations',ops+'?view=activity','Review shared operation activity with the actual actor and recorded outcome.'),
 item('Service status','Operations',ops+'?view=status','Review connected service states. Playground guidance does not perform a live health check.'),
 item('Workspace settings','Operations',ops+'?view=settings','Manage shared eAssist workspace settings. Personal account preferences are available in Agent Studio Settings.'),
];
export function adminCapabilityExecution(name:string){return ['Offer emails','Email previews','Email status','Request approval','Request rejection','Request cancellation','Request fulfilment','Team requests','Role assignment','Admin assignment','Department creation'].includes(name)?'chat':'workspace';}
const groups=['Email','Requests','People','Security','Review Center','Operations','Agent Studio'];
const normalize=(text:string)=>text.trim().toLowerCase().replace(/^\d+[.)]\s*/,'').replace(/[?!.]+$/,'').replace(/\s+/g,' ');
export function isAdminCapabilitiesQuestion(input:string){
 const q=normalize(input);
 return /^(?:(?:please|just)\s+)*(?:(?:tell|show|give)\s+me\s+)?(?:what\s+(?:can\s+(?:(?:a|an|the)\s+)?admin\s+do|(?:(?:a|an|the)\s+)?admin\s+can\s+do)|(?:list|show|tell me|give me)\s+(?:all\s+)?(?:admin\s+(?:actions|capabilities|features)|(?:actions|capabilities|features)\s+(?:of|for)\s+(?:(?:a|an|the)\s+)?admin))\b/.test(q);
}
const aliases:[RegExp,string][]=[
 [/\b(test (?:mail|email)|mail test|email test)\b/,'Test emails'],
 [/\b(offer\s*letter|offer mail|offer email)\b/,'Offer emails'],
 [/\b(mail|email)\b.*\b(status|delivery|sent|failed)\b/,'Email status'],
 [/\b(approve|accept)\b.*\b(request|req-)\b/,'Request approval'],
 [/\breject\b.*\b(request|req-)\b/,'Request rejection'],
 [/\bcancel\b.*\brequest\b/,'Request cancellation'],
 [/\b(fulfil|fulfill|complete)\b.*\brequest\b/,'Request fulfilment'],
 [/\b(disable|deactivate)\b.*\b(account|user|employee|manager|admin)\b/,'Account deactivation'],
 [/\b(enable|activate)\b.*\b(account|user|employee|manager|admin)\b/,'Account activation'],
 [/\b(delete|remove)\b.*\b(account|user|employee|manager|admin)\b/,'Account deletion'],
 [/\b(confirm|conform)\b.*\bemployment\b/,'Employment confirmation'],
 [/\b(qualification|highest degree)\b/,'Qualification management'],
 [/\b(job title|company position|new position)\b/,'Position management'],
 [/\b(staff id|employee id|manager id)\b/,'Staff IDs'],
 [/\breporting manager\b/,'Manager assignment'],
 [/\b(top\s*up|top-up|allocate|add|refill)\b.*\b(tickets|credits)\b/,'Ticket top-ups'],
 [/\b(unlimited tickets|admin tickets)\b/,'Unlimited tickets'],
 [/\b(recruitment|publish.*(?:vacancy|vacancies|jobs)|open positions)\b/,'Recruitment publishing'],
 [/\b(security policy|security policies)\b/,'Security policies'],
 [/\b(security scan|scan project|scan website|scan repository)\b/,'Security scans'],
 [/\b(security report|vulnerability report|scan report)\b/,'Security reports'],
 [/\b(acknowledge|acknowledgement)\b.*\balert\b/,'Alert acknowledgement'],
 [/\b(resolve|resolution)\b.*\balert\b/,'Alert resolution'],
 [/\b(alerts|all alerts)\b/,'Organization alerts'],
 [/\baudit\b/,'Audit activity'],
 [/\b(connect|configure|manage)\b.*\bintegrations?\b/,'Integration management'],
 [/\b(create|edit|manage)\b.*\bagents?\b/,'Agent management'],
 [/\b(create|edit|manage)\b.*\btools?\b/,'Tool management'],
 [/\b(import|upload)\b.*\b(json|readings|metrics|data)\b/,'Data imports'],
 [/\bcollector token\b/,'Collector tokens'],
 [/\b(incidents|servicenow)\b/,'Incident management'],
 [/\b(razorpay|payments|checkout)\b/,'Payment access'],
];
export function adminPlaygroundGuide(input:string,member:WorkspaceAccess){
 if(member.role!=='admin'||!member.active)return null;
 const q=normalize(input);
 const reply=(text:string,choices:string[])=>({reply:text,choices,responseMode:'workspace',recordedAt:new Date().toISOString()});
 if(isAdminCapabilitiesQuestion(input))return reply('**What Admin can do**\n\n'+adminCapabilities.map((c,i)=>`${i+1}. [${c.name}](${c.href})`).join('\n')+'\n\nChoose an area below to start. Chat guides you through document emails, roles, departments and request decisions, with a preview before confirmation. Other features use their linked workspace controls. Email delivery, scans and external automation require configured services; payment checkout is not implemented.',groups.map(g=>'Admin '+g));
 if(/^(admin actions|admin capabilities|what can (?:i|an admin|admin|you) do|all admin features|help)$/.test(q))return reply('**Admin actions**\n\nChoose an area below. Chat can prepare confirmed email, role, department and request actions. Other controls open in their workspace; I will not claim a change without a saved result.',groups.map(g=>'Admin '+g));
 const group=groups.find(g=>q===normalize('Admin '+g));
 if(group){const entries=adminCapabilities.filter(c=>c.group===group);return reply(`**${group}**\n\nChoose the task you want help with.`,entries.map(c=>c.name));}
 let capability=adminCapabilities.find(c=>normalize(c.name)===q);
 if(!capability&&/^(how|where|show|open|help|can|please|i want|i need|manage|view|check)\b/.test(q))capability=adminCapabilities.find(c=>q.includes(normalize(c.name)));
 if(!capability&&/\b(?:activate|deactivate|delete|remove)\b.*\b(?:account|user|employee|manager|admin)\b/.test(q))capability=adminCapabilities.find(c=>c.name===(/deactivate/.test(q)?'Account deactivation':/activate/.test(q)?'Account activation':'Account deletion'));
 if(!capability){const alias=aliases.find(([pattern])=>pattern.test(q));if(alias)capability=adminCapabilities.find(c=>c.name===alias[1]);}
 if(!capability)return null;
 return reply(`**${capability.name}**\n\n${capability.instruction}\n\n${adminCapabilityExecution(capability.name)==='workspace'?'This operation is completed in its workspace screen. No change has been made by this chat.\n\n':''}[Open ${capability.name}](${capability.href})`,[...(capability.commands||[]),'Admin '+capability.group,'Admin actions']);
}
