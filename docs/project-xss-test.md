# AIForce.Ops local XSS test

Tested 12 October 2026 against the running project at `http://localhost:3000`. [Machine-readable evidence](verification/project-xss.json).

| Check | Result |
|---|---|
| Home page `/` — ZAP active reflected-XSS rule 40012 | Completed, zero findings |
| Sign-in `/sign-in` — same active rule | Completed, zero findings |
| Sign-up `/sign-up` — same active rule | Completed, zero findings |
| Actual Playground Markdown renderer | All six malicious-markup/link inputs produced no executable elements, event attributes or executable URLs |
| React user-text escaping | All six inputs escaped |
| Existing ePACE pasted-content and rendering tests | Six verification checks passed, including exclusion of scripts, unsafe links and embedded frames |

Renderer inputs covered script tags, image and SVG event handlers, JavaScript Markdown links, HTML data-URL links and iframe content. The test extracts the actual ReactMarkdown JSX from PlaygroundView instead of maintaining an independent renderer.

The public-page scan exercised the seeded `xss_test` GET query parameter with only ZAP rule 40012 enabled and recursion disabled. No credentials, real-user sessions, POST submissions, existing data changes or external targets were included. No reflected XSS was detected in this limited scope. This is not a guarantee that the application has no XSS.

Remaining coverage: authenticated flows and their actual inputs, stored XSS, DOM-based XSS in a browser, other query/form parameters, rich-text editing and uploads, and role-specific views. Those need their own bounded test accounts and scenarios.

The normal dashboard scanner is still passive. This new script performs a separate explicit active test and stops its ZAP process after completion.

Run with the project already started:

```powershell
node tests/project-xss.mjs
node tests/epace-markdown.mjs
```

The earlier isolated positive/negative controls proved that the installed reflected-XSS rule detects a known vulnerable page and rejects its escaped control; see [scanner capability proof](xss-scanner-proof.md).
