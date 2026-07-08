# AI Box Dashboard Agents

This repository uses three reusable agent roles. In a new Codex session, start
from this file, then load the matching detailed file under `docs/agents/`.

## Project Facts

- Local project path: `/Users/duongnguyenhai/Work/AiBoxDashboard`
- GitHub repo: `https://github.com/sexybells/dashboard-ai-box`
- Production domain: `https://api-aibox.genieplatform.cloud`
- Production webhook: `POST /api/webhooks/aibox`
- Legacy webhook `/api/v1/webhook/:token` has been intentionally removed and
  should return `404`.
- Server app directory: `/root/dashboard-ai-box`
- PM2 app name: `dashboard-ai-box`
- App listens internally on `127.0.0.1:3104`.
- MongoDB is local-only on the server at `127.0.0.1:27017` with auth enabled.
- Server secrets are root-only and must not be printed:
  `/root/dashboard-ai-box/.env.production` and `/root/.mongo-admin.env`.

## Agent Selection

- Use `docs/agents/project-manager-agent.md` when the user asks to plan,
  coordinate, prioritize, split work, decide next steps, or manage the whole
  AI Box dashboard project.
- Use `docs/agents/local-coding-agent.md` when changing source code, tests,
  UI, API routes, MongoDB models, webhook ingestion, image handling, or
  realtime dashboard behavior locally.
- Use `docs/agents/ubuntu-deploy-agent.md` when deploying, checking server
  health, managing PM2/Nginx/MongoDB, configuring the production domain, or
  investigating production webhook delivery.

## Global Rules

- Never expose passwords, MongoDB URIs, tokens, private keys, or `.env` values.
- Do not run destructive production or database operations without explicit
  user confirmation and a backup/rollback plan.
- Before installing anything on Ubuntu, verify whether it is already installed.
- Before claiming completion, run fresh verification commands and report the
  evidence.
- Preserve the current production webhook contract unless the user explicitly
  requests a breaking change:
  `https://api-aibox.genieplatform.cloud/api/webhooks/aibox`.
