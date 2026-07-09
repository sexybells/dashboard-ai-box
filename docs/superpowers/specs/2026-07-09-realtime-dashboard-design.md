# Realtime Dashboard Design

## Goal

Make the AI Box dashboard visibly realtime in local development: new alarms should appear at the top of the table as soon as the webhook creates them, without waiting for a manual refresh or the 30 second polling fallback.

## Scope

- Preserve the active webhook path `/api/webhooks/aibox`.
- Preserve the existing SSE endpoint `/api/alarms/stream`.
- Keep polling and the Refresh button as a reconciliation fallback.
- Do not add browser notifications, sound, WebSocket infrastructure, or new runtime dependencies.

## Architecture

Webhook ingestion remains centralized in `src/services/alarm-ingest.ts` and the shared webhook handler. When a new alarm is created, the handler publishes an `alarm-created` realtime event containing the serialized alarm list item, not only the id. The SSE route streams that event to connected dashboards.

The dashboard keeps the current fetch-based list as the canonical baseline. On each realtime event, the client merges the incoming alarm into the current list, dedupes by `id`, prepends matching items, updates totals, records a "new alarm" badge, and highlights the row for a few seconds. If the new alarm does not match active filters, totals still update but the row is not inserted.

## UI Behavior

- Realtime status remains `Connecting`, `Live`, or `Offline`.
- A new alarm appears at the top of `Recent alarms` immediately when it matches the current filters.
- New rows are visually highlighted for about five seconds.
- A compact badge near the table heading shows that a new alarm was received.
- Manual refresh and polling clear stale highlight/badge state through normal list replacement.

## Testing

- Add unit tests for a pure realtime merge helper covering prepend, dedupe, total updates, and active filters.
- Add a handler-level test proving new webhook ingestion publishes an event with serialized alarm data.
- Keep existing SSE formatting and event subscriber tests intact.
- Run `npm run test`, `npm run lint`, and `npm run build` because route/server/UI behavior changes.
