# Infrastructure use-case coverage

Reviewed 5 October 2026 against the supplied “Infra use-cases” screenshot. This is a code and integration coverage review, not a validation against a connected enterprise infrastructure estate.

The project has a shared operations foundation: authenticated workspaces, PostgreSQL history, leased collection for Prometheus / Alertmanager / Semaphore, eAssist alerts and activity, controlled automation actions, and agent authoring. That foundation does **not** establish that the five specialized agents below are deployed or that the efficiency claims in the reference have been achieved.

| Reference use case | Current coverage | Gap / what is needed |
| --- | --- | --- |
| Commvault backup failure prediction | Generic incoming alerts, stored events and automation integration | No Commvault adapter or prediction model. Need read-only Commvault job APIs, job/resource/network history, failure labels, an evaluated prediction method and preventive playbooks. |
| Storage L3 / dynamic storage optimization | Generic source collection and inventory data ingestion | No storage-provider metrics adapter, controller topology, volume/pool balancing or safety checks. Need vendor APIs, IOPS/latency/throughput/capacity time series and approved vendor-specific actions. |
| Windows L3 / server health and performance | Prometheus target health, scrape availability and generic alert ingestion | Target “up” is not CPU, RAM, disk or patch health. Need Windows exporters, metric-specific rules, memory-leak trend analysis, maintenance windows, patch testing and rollback playbooks. |
| VCF / hybrid cloud security and compliance | Vulnerability evidence reporting and controlled alert/automation foundation | No vCenter/NSX/vSAN configuration collectors, SDDC control framework or autonomous policy repair. Need read-only platform APIs, policy definitions, drift baselines, change review and tested rollback. |
| Linux / RHEL health | Prometheus target health and alerts | No shipped OS-specific failed-service, disk-pressure, CPU-load or anomaly rules. Need node/systemd exporters, alert rules and reviewed RHEL remediation playbooks. |

## Evidence in this repository

- `lib/eassist/sync.ts`: supported source collectors and leased refresh.
- `lib/service-review/model.ts`: current Prometheus projection is target counts, scrape health and recorded `up` availability; it does not calculate host-resource or predictive signals.
- `lib/service-review/ingestion.ts`: validated external readings, including inventory and forecast records supplied by an external collector. Accepting a forecast is not implementing a forecasting model.
- `lib/eassist/platform.ts`: website event recording, shared alerts and Alertmanager relay.
- `lib/eassist/actions.ts` and `security.ts`: integration actions and account action policy.
- `app/api/service-review-center/vulnerabilities/route.ts`: owner-scoped scan evidence, history, source-severity alerts and advisory analysis. These are report reviews, not proof of continuous infrastructure auditing.

## Practical next step

Start with Windows and Linux telemetry through the existing Prometheus connection. Provide the owned test hosts, exporter endpoints and the Prometheus instance that scrapes them. Then implement and test named resource metrics, thresholds and service alerts. Add storage, backup and VCF adapters only after their real APIs and a test environment are available.

Historical detection must precede predictive claims. Remediation must have a reviewed target, an action policy, a dry run or test environment, verification and rollback. The reference's 15–35% improvement figures require measured baselines and outcomes; the application must not display them as achieved results.
