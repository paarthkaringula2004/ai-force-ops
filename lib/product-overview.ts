export type KnowledgeStatus = "Established" | "Partially defined" | "Needs source detail";
export type MapItemKind = "persona" | "capability" | "product area";

export type ProductMapItem = {
  id: string;
  name: string;
  kind: MapItemKind;
  status: KnowledgeStatus;
  summary: string;
  established: string[];
  toConfirm: string[];
};

export type ProductOverviewModel = {
  productName: string;
  projectTagline: string;
  productDescription: string;
  personas: ProductMapItem[];
  capabilities: ProductMapItem[];
  productAreas: ProductMapItem[];
  technology: { area: string; choices: string[] }[];
  proposedFirstBackendSlice: {
    title: string;
    reason: string;
    firstQuestions: string[];
  };
};

export const productOverview: ProductOverviewModel = {
  productName: "AIForce.Ops",
  projectTagline: "Intelligent Service Operations Platform",
  productDescription: "SaaS Service Review Center",
  personas: [
    { id: "cxo", name: "CXO", kind: "persona", status: "Established", summary: "Executive view.", established: ["Executive view is identified in the source material."], toConfirm: ["Specific decisions, dashboard content, and access rules."] },
    { id: "hcbu", name: "HCBU", kind: "persona", status: "Established", summary: "Business unit view.", established: ["Business unit view is identified in the source material."], toConfirm: ["Business unit journeys, data scope, and access rules."] },
    { id: "command-center", name: "Command Center", kind: "persona", status: "Established", summary: "Operational view.", established: ["Operational view is identified in the source material."], toConfirm: ["Operator workflow, prioritization, and access rules."] },
    { id: "ai-ops", name: "AI Ops", kind: "persona", status: "Established", summary: "AI operations view.", established: ["AI operations view is identified in the source material."], toConfirm: ["Which operations, agents, and controls belong in the first release."] },
    { id: "platform", name: "Platform", kind: "persona", status: "Established", summary: "Platform capability view.", established: ["Platform view is identified and names all six capability labels."], toConfirm: ["Capability ownership, boundaries, and administrative tasks."] },
  ],
  capabilities: [
    { id: "ifso", name: "IFSO", kind: "capability", status: "Partially defined", summary: "A named platform capability with an associated architecture area.", established: ["IFSO is in the platform taxonomy.", "An IFSO architecture is part of the project source material."], toConfirm: ["Acronym expansion, components, responsibilities, and interfaces from the original diagram."] },
    { id: "aism", name: "AISM", kind: "capability", status: "Needs source detail", summary: "A named platform capability.", established: ["AISM is in the platform taxonomy."], toConfirm: ["Expansion, purpose, users, and boundaries."] },
    { id: "isoa", name: "ISOA", kind: "capability", status: "Needs source detail", summary: "A named platform capability.", established: ["ISOA is in the platform taxonomy."], toConfirm: ["Expansion, purpose, users, and boundaries."] },
    { id: "aem", name: "AEM", kind: "capability", status: "Partially defined", summary: "The source connects AEM with automation.", established: ["AEM is in the platform taxonomy and automation is a product area."], toConfirm: ["Triggers, actions, integrations, approvals, guardrails, and audit behavior."] },
    { id: "pc", name: "P&C", kind: "capability", status: "Needs source detail", summary: "A named platform capability.", established: ["P&C is in the platform taxonomy."], toConfirm: ["Expansion, purpose, users, and boundaries."] },
    { id: "vi", name: "V&I", kind: "capability", status: "Needs source detail", summary: "A named platform capability.", established: ["V&I is in the platform taxonomy."], toConfirm: ["Expansion, purpose, users, and boundaries."] },
  ],
  productAreas: [
    { id: "ifso-architecture", name: "IFSO Architecture", kind: "product area", status: "Partially defined", summary: "An IFSO architecture area is included in the supplied project material.", established: ["An IFSO architecture diagram is part of the project source material."], toConfirm: ["Exact components, labels, relationships, and whether any diagram elements describe runtime systems."] },
    { id: "iem", name: "IEM · Event → Incident", kind: "product area", status: "Partially defined", summary: "An event-to-incident lifecycle with associated metrics.", established: ["The source names an Event → Incident lifecycle and metrics."], toConfirm: ["Lifecycle states, transition rules, metric names/formulas, thresholds, and system of record."] },
    { id: "environment", name: "Environment & Geo Health", kind: "product area", status: "Partially defined", summary: "Environment inventory, regional analysis, capacity forecasting, and geographic health.", established: ["Inventory categories: Servers, Network, Storage, Appliances / Other, Database.", "Regions: EU, LATAM, APAC. Environments: PROD, DEV, QA.", "Forecast concepts: lower/upper bound, regression, outliers; geo views include country, site, category, device, and errors."], toConfirm: ["Authoritative data sources, definitions, freshness, forecast method, and production health rules."] },
    { id: "aem-automation", name: "AEM · Automation", kind: "product area", status: "Partially defined", summary: "Automation is included in the product scope.", established: ["AEM is associated with automation."], toConfirm: ["Which actions run, what initiates them, who approves them, and how failures are handled."] },
    { id: "business-value", name: "Business Value Dashboard", kind: "product area", status: "Partially defined", summary: "Business value indices and supporting measures for service review.", established: ["Primary indices: Experience, Automation, Financial, Innovation.", "Supporting measures: Benchmarked, Sustainability, Tech Debt Reduction."], toConfirm: ["Metric formulas, sources, time windows, ownership, and the conflicting Experience values (92% and 29%) shown in screenshots."] },
    { id: "master-architecture", name: "Master Architecture", kind: "product area", status: "Partially defined", summary: "A consolidated view of the confirmed product areas and relationships.", established: ["A Master Architecture view is part of the project deliverables."], toConfirm: ["Exact relationships from the source diagrams. It must not imply an unconfirmed runtime topology."] },
  ],
  technology: [
    { area: "Application", choices: ["Next.js App Router", "React", "TypeScript", "Next.js runtime"] },
    { area: "Workflow UI", choices: ["React Flow", "Tailwind CSS", "shadcn-style components"] },
    { area: "Data and identity", choices: ["PostgreSQL (SQL)", "Authentication not selected"] },
    { area: "AI and protection", choices: ["OpenAI Agents SDK + API", "Arcjet"] },
    { area: "Connections and tooling", choices: ["HTTPS APIs", "npm"] },
  ],
  proposedFirstBackendSlice: {
    title: "IEM Event → Incident",
    reason: "It is the clearest named operational lifecycle in the source material and gives us a concrete vertical slice through a user view, data model, and service workflow.",
    firstQuestions: ["Confirm the exact lifecycle states and transitions.", "Transcribe the associated metric names and formulas.", "Identify the system of record and required event/incident fields."],
  },
};
