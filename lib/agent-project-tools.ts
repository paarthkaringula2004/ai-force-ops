import { integrationCatalog, integrationPurpose } from "./integrations/catalog";
export const projectTools = [
  ...integrationCatalog.map(p=>({id:`integration:${p.id}`,name:p.name,purpose:integrationPurpose(p)})),
  { id: "meeting_rooms", name: "Meeting-room availability", purpose: 'Read configured AIForce.Ops rooms, current reservation availability and the signed-in person’s bookings. For an interval pass JSON {"start":"ISO datetime with timezone","end":"ISO datetime with timezone","attendees":4}. No argument lists rooms/configuration. This read never reserves a room. Direct users to /dashboard/meeting-rooms to review and confirm a reservation. No external calendar invitations are created.' },

  { id: "agent_assist", name: "Agent Assist", purpose: "Help explain recorded operational evidence, missing sources and practical next steps. Read-only; uses only the caller’s authorized project data." },

  { id: "chart_visualizer", name: "Chart Visualizer", purpose: 'Create a bar chart from verified records. Pass request as JSON {"source":"scan_reports"} for latest findings by severity, {"source":"incidents"} for latest 20 incidents by priority, or {"source":"requests"} for caller’s latest 20 requests by status. Never supply invented numbers. Operational sources require Admin access.' },

  { id: "scan_reports", name: "Security scan reports", purpose: "Read the latest completed ZAP, Trivy and imported scanner findings from the server on each request, with scan ID, completion time, check time and latest job status. This is a current read of recorded results; it does not start a scan. Authenticated and active scanning are unavailable through this tool. Admin access required." },

  { id: "service_health", name: "Service health", purpose: "Read latest shared stored service-health readings with source, observation time and retrieval time. These are last recorded checks, not live endpoint or database activity checks. Availability requires measured samples, period and method. Admin access required." },

  { id: "incidents", name: "ServiceNow incidents", purpose: "Check the configured ServiceNow incident API on demand. Report live access and check time, or explicitly identify disconnected, paused or cached results. Ask for an INC number to read a specific incident. Admin access required." },

  { id: "profile", name: "My profile", purpose: "Read the signed-in person’s name, department and employee ID." },

  { id: "requests", name: "My workplace requests", purpose: "Read the signed-in person’s saved requests and approval status." },

];

