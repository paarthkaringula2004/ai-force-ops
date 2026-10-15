# XSS scanner capability test

Verified on 12 October 2026 with the installed ZAP scanner. See [machine-readable evidence](verification/xss-scanner-proof.json).

| Test | Result |
|---|---|
| Current production web-baseline function against the intentional reflected-XSS fixture | Completed; 18 observations, zero XSS findings |
| ZAP active reflected-XSS rule 40012 against the vulnerable fixture | One reflected-XSS finding |
| Same active rule against the HTML-escaped control | Zero reflected-XSS findings |

The installed scanner can detect this reflected-XSS example when its active rule is enabled. The current application workflow uses passive checks and does not exercise that rule. The active check in this proof is test-only; it has not been enabled for ordinary project scans.

This is a capability/control test, not an assessment that AIForce.Ops is vulnerable or free of XSS. Stored XSS, DOM-based XSS, authenticated pages, and application forms were not assessed. The 18 baseline observations belong to the isolated fixture, not the production application.

The fixture was bound only to 127.0.0.1 on an ephemeral port. It accepted GET requests and held no employee data, sessions or credentials. The test stopped its HTTP server and ZAP process after completion; no application requests, emails or database records were created. Temporary profiles remain under the ignored `.security-runs` directory.

Run again from the repository root:

```powershell
node tests/xss-scanner-proof.mjs
```

Requires the existing installed Java/ZAP tools. The test invokes the same `scanWebBaseline` function used by `scanProject`, then separately runs only reflected-XSS rule 40012 against two local control URLs.

Rule documentation: [ZAP Cross Site Scripting (Reflected)](https://www.zaproxy.org/docs/alerts/40012/).
