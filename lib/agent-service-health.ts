type HealthRecord = { recordKey: string; recordType: string; payload: Record<string, unknown>; observedAt: unknown; sourceName?: string; sourceKind?: string };

export function serviceHealthEvidence(rows: HealthRecord[], checkedAt = new Date().toISOString()) {
  return {
    mode: "recorded", evidenceKind: "infrastructure_service_health", checkedAt,
    liveCheckExecuted: false, databaseActivityEvidenceProvided: false,
    scope: "Up to 30 latest stored health/availability records by record key; not a database query or audit log feed.",
    capabilities: { readStoredHealth: true, liveServiceCheck: false, databaseActivityCheck: false },
    records: rows.map(row => {
      const payload = { ...row.payload };
      const observed = row.observedAt ? new Date(String(row.observedAt)).getTime() : NaN;
      const samples = payload.samples;
      const supported = row.recordType === "availability" && typeof payload.availability === "number" && Number.isFinite(payload.availability) && payload.availability >= 0 && payload.availability <= 100 && typeof samples === "number" && Number.isInteger(samples) && samples > 0 && typeof payload.period === "string" && Boolean(payload.period.trim()) && typeof payload.method === "string" && Boolean(payload.method.trim());
      if (!supported) delete payload.availability;
      return { ...row, payload, observedAt: Number.isFinite(observed) ? new Date(observed).toISOString() : null,
        ageSeconds: Number.isFinite(observed) ? Math.max(0, Math.floor((Date.parse(checkedAt) - observed) / 1000)) : null,
        ...(row.recordType === "availability" || row.payload.availability !== undefined ? { availabilityEvidence: { supported, reason: supported ? "Measured sample fraction for the stated period; report sample count and method. Gaps may not be counted; this is not guaranteed uptime or an SLA." : "Availability percentage withheld: a valid measurement, positive sample count, period and calculation method are required." } } : {}) };
    }),
    guidance: "Describe status as the last recorded check at observedAt, not current health. Read time checkedAt does not mean a new endpoint check. Service health is not database activity monitoring. Identify missing database audit/query evidence separately from optional ServiceNow/security tools. Do not infer monitoring failure from one endpoint outage, offer unconnected live checks, or present IP geography as the physical database location.",
  };
}
