# AI Box Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a new local LAN AI Box dashboard that receives webhook alarms, stores them in MongoDB, persists images to disk, and displays alarms in a Next.js UI.

**Architecture:** A single Next.js App Router application provides route handlers for webhook ingestion and alarm APIs. Mongoose owns MongoDB connection and schemas. UI pages call internal APIs and render normalized alarm records.

**Tech Stack:** Next.js 16, React 19, TypeScript, MongoDB, Mongoose, Vitest, Tailwind CSS.

## Global Constraints

- Use MongoDB, not Firebase.
- Do not modify `/Users/duongnguyenhai/Work/VideoAlarmSystem`.
- Store base64 alarm images under `storage/alarm-images`.
- Use deduplication by `UniqueId`, `AlarmId`, or payload hash.
- Run locally on LAN and expose the webhook at `/api/webhooks/aibox`.

---

### Task 1: Project Skeleton

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `postcss.config.mjs`
- Create: `tailwind.config.ts`
- Create: `vitest.config.ts`
- Create: `.env.example`
- Create: `.gitignore`

**Interfaces:**
- Produces project scripts: `dev`, `dev:lan`, `build`, `start`, `start:lan`, `lint`, `test`.

- [ ] Create config files for a TypeScript Next.js app.
- [ ] Install dependencies.
- [ ] Verify `npm run test` starts Vitest.

### Task 2: Alarm Normalization And Image Storage

**Files:**
- Create: `src/lib/aibox/normalize.ts`
- Create: `src/lib/aibox/image-storage.ts`
- Create: `src/lib/aibox/hash.ts`
- Test: `src/lib/aibox/normalize.test.ts`
- Test: `src/lib/aibox/image-storage.test.ts`

**Interfaces:**
- Produces `normalizeAiBoxAlarm(payload, payloadHash): NormalizedAlarmInput`.
- Produces `persistAlarmImage(imageData, dedupeKey): Promise<ImagePersistenceResult>`.

- [ ] Write failing tests for dedupe key selection, base64 detection, and normalized task fields.
- [ ] Implement normalization and image persistence.
- [ ] Run targeted tests until they pass.

### Task 3: MongoDB Models

**Files:**
- Create: `src/lib/mongodb.ts`
- Create: `src/models/alarm.ts`
- Create: `src/models/webhook-event.ts`

**Interfaces:**
- Produces `connectMongo(): Promise<typeof mongoose>`.
- Produces `AlarmModel` and `WebhookEventModel`.

- [ ] Implement Mongoose connection reuse.
- [ ] Define schemas with indexes for dashboard filters.
- [ ] Type model documents without leaking `any` into API code.

### Task 4: Webhook Route

**Files:**
- Create: `src/app/api/webhooks/aibox/route.ts`
- Test: `src/app/api/webhooks/aibox/route.test.ts`

**Interfaces:**
- Consumes normalization, image persistence, MongoDB models.
- Produces `POST /api/webhooks/aibox`.

- [ ] Write failing route tests for valid payload, duplicate payload, and invalid JSON.
- [ ] Implement route handler with raw event logging and alarm upsert.
- [ ] Return JSON containing `{ ok, duplicate, id }`.

### Task 5: Alarm APIs

**Files:**
- Create: `src/app/api/alarms/route.ts`
- Create: `src/app/api/alarms/[id]/route.ts`
- Create: `src/app/api/alarm-images/[filename]/route.ts`

**Interfaces:**
- Produces paginated alarm list API.
- Produces detail API by MongoDB id.
- Produces safe local image serving by filename.

- [ ] Implement filters for query, task, summary, camera, and date range.
- [ ] Implement detail route.
- [ ] Implement image route with filename sanitization.

### Task 6: Dashboard UI

**Files:**
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`
- Create: `src/app/alarms/[id]/page.tsx`
- Create: `src/app/globals.css`
- Create: `src/components/alarm-dashboard.tsx`
- Create: `src/components/alarm-detail.tsx`

**Interfaces:**
- Consumes alarm APIs.
- Produces operator-facing dashboard and detail pages.

- [ ] Build dashboard with KPI cards, filters, and recent alarm table.
- [ ] Render image thumbnails using `imageUrl`.
- [ ] Build detail page with large image, metadata, properties, and raw JSON.

### Task 7: Verification And LAN Run

**Files:**
- Modify: `README.md`

**Interfaces:**
- Produces setup instructions and AI Box callback URL examples.

- [ ] Run tests.
- [ ] Run build.
- [ ] Document MongoDB setup and LAN callback URL.
