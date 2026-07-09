# Realtime Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** New AI Box alarms appear in the dashboard immediately with a short visual highlight and a new-alarm badge.

**Architecture:** Publish serialized alarm list items in the existing SSE `alarm-created` event. Keep the dashboard's periodic fetch as reconciliation, but merge realtime events into local state for immediate UI feedback.

**Tech Stack:** Next.js App Router, React client component, TypeScript, MongoDB/Mongoose, SSE EventSource, Vitest.

## Global Constraints

- Preserve `/api/webhooks/aibox`.
- Preserve `/api/alarms/stream`.
- Do not add WebSocket infrastructure or new dependencies.
- Keep polling and manual refresh fallback.
- Run full test, lint, and build verification before reporting completion.

---

### Task 1: Realtime Merge Helper

**Files:**
- Create: `src/services/realtime-alarm-list.ts`
- Test: `src/services/realtime-alarm-list.test.ts`

**Interfaces:**
- Produces `mergeRealtimeAlarm(current, alarm, filters, limit): RealtimeAlarmMergeResult`.
- Produces `alarmMatchesFilters(alarm, filters): boolean`.

- [ ] Write failing tests for prepend, dedupe, total increments, and filter mismatch.
- [ ] Implement the helper with no React dependency.
- [ ] Run `npm run test -- src/services/realtime-alarm-list.test.ts`.

### Task 2: Server Event Payload

**Files:**
- Modify: `src/services/alarm-ingest.ts`
- Modify: `src/services/alarm-events.ts`
- Modify: `src/app/api/webhooks/aibox/handler.ts`
- Test: `src/services/alarm-events.test.ts`
- Test: `src/app/api/webhooks/aibox/handler.test.ts`

**Interfaces:**
- Extend `AlarmRealtimeEvent` with `alarm?: AlarmListItem`.
- Extend `AlarmIngestResult` with `alarm?: AlarmListItem`.

- [ ] Write failing tests proving new webhook events include alarm data and duplicates do not publish.
- [ ] Return serialized created alarm data from ingestion.
- [ ] Publish that alarm data in `alarm-created`.
- [ ] Run related tests.

### Task 3: Dashboard UI

**Files:**
- Modify: `src/components/alarm-dashboard.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes `mergeRealtimeAlarm`.
- Consumes `alarm-created` SSE events containing `{ alarm }`.

- [ ] Parse SSE event data safely.
- [ ] Merge matching alarm rows into state immediately.
- [ ] Track highlighted alarm ids for five seconds.
- [ ] Show compact new-alarm badge in the table heading.
- [ ] Keep polling and manual refresh behavior.

### Task 4: Verification

**Files:**
- No source files.

- [ ] Run `npm run test`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run build`.
- [ ] Review `git diff --stat` and `git diff`.
