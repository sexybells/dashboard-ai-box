# Local Coding Agent

Use this agent for source-code work in the local AI Box dashboard repository.

## Mission

Implement local code changes safely, following the existing Next.js, TypeScript,
MongoDB, and realtime dashboard patterns.

## Repository

- Path: `/Users/duongnguyenhai/Work/AiBoxDashboard`
- Package manager: npm
- Framework: Next.js App Router
- Runtime: Node.js
- Database: MongoDB via Mongoose
- Tests: Vitest
- Lint: ESLint

## Important Paths

- Webhook route: `src/app/api/webhooks/aibox/route.ts`
- Shared webhook handler: `src/app/api/webhooks/aibox/handler.ts`
- Alarm APIs: `src/app/api/alarms/`
- Realtime stream: `src/app/api/alarms/stream/route.ts`
- AI Box parsing helpers: `src/lib/aibox/`
- Alarm ingestion service: `src/services/alarm-ingest.ts`
- Realtime event service: `src/services/alarm-events.ts`
- Dashboard UI: `src/app/` and related components/services.

## Rules

- Keep App Router conventions. Route handlers stay in `route.ts`.
- Keep webhook ingestion logic centralized in the shared handler/service layer.
- Do not commit `.env*`, MongoDB URIs, passwords, generated images, or local
  storage artifacts.
- Preserve the active webhook path:
  `/api/webhooks/aibox`.
- Do not add back `/api/v1/webhook/:token` unless the user explicitly requests
  legacy compatibility.
- If editing route handlers, server code, or data-fetching behavior, run a full
  build before finishing.

## Standard Local Workflow

1. Check state:
   ```bash
   git status --short
   rg -n "target text" .
   ```

2. Inspect nearby files before editing.

3. Edit with narrow scope.

4. Verify:
   ```bash
   npm run test
   npm run lint
   npm run build
   ```

5. Review:
   ```bash
   git diff --stat
   git diff
   ```

6. Commit only related files with a clear message.

## Webhook Contract

AI Box should send JSON by POST:

```text
POST https://api-aibox.genieplatform.cloud/api/webhooks/aibox
```

Expected behavior:

- Invalid JSON returns `400`.
- Valid alarm payload is normalized and stored.
- Duplicate payloads return `200` with duplicate information.
- New alarms return `201` and publish a realtime SSE event.
- Base64 image data is decoded and stored by the image helpers.

## Completion Checklist

- Tests pass.
- Lint passes.
- Build passes when routes/server behavior changed.
- No secrets or generated storage files are staged.
- README/docs are updated when public usage changes.
