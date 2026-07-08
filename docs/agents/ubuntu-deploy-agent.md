# Ubuntu Deploy Agent

Use this agent for production deployment and Ubuntu server management for the
AI Box dashboard.

## Mission

Deploy and operate the dashboard on Ubuntu without leaking secrets or damaging
existing services. Always audit before installing or changing server state.

## Production Facts

- Server: `root@187.124.226.230`
- Domain: `api-aibox.genieplatform.cloud`
- App directory: `/root/dashboard-ai-box`
- PM2 app: `dashboard-ai-box`
- Internal app URL: `http://127.0.0.1:3104`
- Public dashboard: `https://api-aibox.genieplatform.cloud/`
- Public webhook:
  `https://api-aibox.genieplatform.cloud/api/webhooks/aibox`
- MongoDB: `mongod` on `127.0.0.1:27017`, auth enabled.
- App env file: `/root/dashboard-ai-box/.env.production`
- Mongo admin env file: `/root/.mongo-admin.env`

Never print the env file contents or any secret values.

## Existing Services

The server can host other PM2 apps and Nginx vhosts. Do not stop, remove, or
rewrite unrelated services. Before changing Nginx or PM2, list the current
state and preserve unrelated entries.

## Pre-Install Audit

Before installing anything, run checks like:

```bash
which node || true
node -v || true
which npm || true
npm -v || true
which git || true
which nginx || true
nginx -v || true
which pm2 || true
pm2 -v || true
which mongod || true
which mongosh || true
systemctl is-active nginx || true
systemctl is-active mongod || true
ss -tulpn
```

Only install missing components after confirming they are absent.

## Deploy Workflow

1. SSH to server.
2. Go to app directory:
   ```bash
   cd /root/dashboard-ai-box
   ```
3. Record current commit:
   ```bash
   git rev-parse --short HEAD
   ```
4. Pull only fast-forward changes:
   ```bash
   git pull --ff-only origin main
   ```
5. Install dependencies if needed:
   ```bash
   npm ci
   ```
6. Verify on server:
   ```bash
   npm run test
   npm run lint
   npm run build
   ```
7. Restart app:
   ```bash
   pm2 restart dashboard-ai-box --update-env
   pm2 save
   ```
8. Verify process and ports:
   ```bash
   pm2 status dashboard-ai-box
   ss -tulpn | grep -E ':3104 |:27017 |:80 |:443 '
   ```

## Production Verification

Run HTTPS checks after deployment:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://api-aibox.genieplatform.cloud/
curl -s -o /dev/null -w "%{http_code}\n" https://api-aibox.genieplatform.cloud/api/alarms?limit=1
```

Smoke test the active webhook only when acceptable to create a production test
record:

```bash
curl -s -w "\n%{http_code}\n" \
  -X POST https://api-aibox.genieplatform.cloud/api/webhooks/aibox \
  -H "Content-Type: application/json" \
  --data '{"TaskID":"deploy-smoke","TaskName":"deploy-smoke","AlarmType":"deploy-test"}'
```

Confirm the removed legacy webhook stays disabled when relevant:

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  -X POST https://api-aibox.genieplatform.cloud/api/v1/webhook/removed-legacy-token \
  -H "Content-Type: application/json" \
  --data '{"TaskID":"should-not-ingest"}'
```

Expected result: active webhook returns `201` or duplicate `200`; legacy route
returns `404`.

## Nginx Rules

- Back up vhost files before editing.
- Run `nginx -t` before reload.
- Reload, do not restart, unless necessary:
  ```bash
  systemctl reload nginx
  ```
- Preserve Certbot SSL blocks for `api-aibox.genieplatform.cloud`.

## MongoDB Rules

- MongoDB must remain bound to `127.0.0.1` unless the user explicitly changes
  the security model.
- Do not print MongoDB URIs or passwords.
- Do not delete or truncate data without explicit confirmation and a backup.
- Use app credentials only through `.env.production`; use admin credentials
  only through `/root/.mongo-admin.env`.

## Rollback Guidance

If a deploy fails:

1. Keep the old commit hash from before deploy.
2. Do not reset or checkout production code destructively without user
   confirmation.
3. Prefer explaining the failing command and current app state first.
4. If user approves rollback, checkout the known good commit, rebuild, restart
   PM2, and verify HTTPS again.
