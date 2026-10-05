# Service Review Center PostgreSQL data

The authenticated API stores operational readings per signed-in account in `service_review_records`. The page polls the API every five seconds and only returns readings owned by the current user. No operational sample rows are inserted by the migration.

Apply the schema with `npm run db:migrate`. The API accepts up to 250 records per request at `POST /api/service-review-center/records` and reads the most recent 1,500 records at `GET /api/service-review-center/records`.

Each record uses this shape:

```json
{
  "recordType": "metric",
  "recordKey": "experience",
  "payload": { "label": "Experience Index", "value": 92, "unit": "%" },
  "observedAt": "2026-10-04T12:00:00.000Z"
}
```

Supported payloads:

- `metric`: `label`, numeric `value`, optional `unit`. Use stable keys such as `experience`, `automation`, `financial`, `innovation`, `benchmarked`, `sustainability`, `techDebt`, `aiopsIndex`, `observeIndex`, `engageIndex`, and `actIndex`.
- `health`: `device`, `status`; optional `ipAddress`, `site`, `category`, `country`, `vendor`, and `description`.
- `inventory`: `region`, `category`, numeric `count`; optional `environment` and `previousCount`.
- `lifecycle`: `stage`, numeric `count`.
- `forecast`: `environment`, `period`, numeric `lowerBound` and `upperBound`; optional `actual`, `regression`, and `outlier`.
- `availability`: `service`, numeric `availability`.

The page displays an empty state until the account has readings. This leaves metric definitions and telemetry ownership with the actual PostgreSQL producer instead of manufacturing figures in the browser.
