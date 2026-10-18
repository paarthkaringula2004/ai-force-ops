# Restore authenticated Prometheus collection

The website was reachable, but the `eassist` scrape failed with HTTP 401.
Prometheus requests `/api/metrics` without a browser login. The application now
accepts a dedicated read-only bearer token on that GET endpoint. Other API
permissions are unchanged. Signed-in active Admins retain access to metrics.

## 1. AIForce.Ops service on Render

Open **Environment** on the `ai-force-ops` service and add:

```text
PROMETHEUS_METRICS_TOKEN=<the private token>
```

The token has already been generated locally at:

```text
C:\Users\Paarth\.config\AIForce-Ops\prometheus_metrics_token
```

Copy only the token inside that file, without quotes or `Bearer `. Do not commit
the private file. Local development also loads it from the private `secrets.env`
in that directory after the development server restarts.

Push the changed application code and redeploy the AIForce.Ops service. Setting
the environment variable without deploying the new code will still return 401.

## 2. Prometheus service on Render

Select the **eassist-prometheus** service, not the AIForce.Ops service.
Under **Environment → Secret Files**, add:

```text
Filename: prometheus_metrics_token
Contents: the exact same private token
```

Render mounts this file at `/etc/secrets/prometheus_metrics_token` at runtime.
Keep the file readable by the Prometheus container user. If Render logs report
permission denied, add the container user to group 1000 as described in Render's
Docker secrets documentation. Never bake the token into the Docker image.

In the Prometheus service's actual `prometheus.yml`, update the existing
`eassist` job to include authorization:

```yaml
  - job_name: eassist
    scheme: https
    metrics_path: /api/metrics
    authorization:
      type: Bearer
      credentials_file: /etc/secrets/prometheus_metrics_token
    static_configs:
      - targets: [ai-force-ops.onrender.com]
```

Keep the other jobs, alert rules, and settings. Replace the existing job; do not
add a second job with the same name. Redeploy Prometheus with this configuration
and the secret file. The local workspace copies have been updated in
`../Project Docs/monitoring/prometheus.yml` and `../deploy/prometheus/prometheus.yml`.
These are outside the application's Git repository: updating only the
AIForce.Ops repository will not deploy the Prometheus configuration.

## 3. Verify

In Prometheus **Status → Targets**, the `eassist` target should become UP after
the next scrape if the website and metrics database queries are reachable.
The Review Center then updates after its next integration sync. A request to
`/api/metrics` without the token or an Admin session must still be rejected.

The old failed scrapes remain in the 24-hour availability history. The current
health can become Healthy while the historical percentage recovers gradually.
Check the `eassist_database_up` metric separately: HTTP collection success alone
does not prove that database queries succeeded.

References: [Prometheus authorization configuration](https://prometheus.io/docs/prometheus/latest/configuration/configuration/),
[Render secret files](https://render.com/docs/configure-environment-variables#secret-files),
[Docker secret file permissions](https://render.com/docs/docker-secrets#accessing-secret-files-at-runtime).
