# AI Box Dashboard Design

## Goal

Build a local LAN dashboard that receives AI Box webhook callbacks, stores alarms in MongoDB, and shows alarm information for operators.

## Scope

Phase 1 is a generic alarm dashboard. It receives all AI Box alarm payloads, stores raw and normalized fields, displays recent alarms, and supports basic filtering by task, camera, alarm type, and date.

Phase 2 will add task-specific detail modules such as People Counting, Face Capture, Intrusion, Parking, and other AI Box task families.

## Architecture

The project is a single Next.js full-stack app using App Router route handlers for APIs and React server/client components for the dashboard. MongoDB is the persistent database via Mongoose. Alarm images sent as base64 are written to local disk under `storage/alarm-images`, while MongoDB stores metadata and local image URLs.

## Data Flow

AI Box sends `POST /api/webhooks/aibox` over LAN. The route handler validates that the request is JSON, stores a raw webhook event for debugging, normalizes important alarm fields, deduplicates using `UniqueId`, `AlarmId`, or a payload hash, writes base64 images to local storage, then upserts the alarm into MongoDB.

Dashboard pages read from `/api/alarms` and `/api/alarms/[id]`. Static image files are served by `/api/alarm-images/[filename]` so the UI can render thumbnails and detail images without exposing arbitrary filesystem paths.

## Data Model

`webhook_events` stores request diagnostics:
- `receivedAt`
- `source`
- `payloadHash`
- `payload`

`alarms` stores normalized alarm records:
- `dedupeKey`
- `alarmId`
- `uniqueId`
- `taskSession`
- `taskDesc`
- `summary`
- `description`
- `time`
- `timestamp`
- `boardId`
- `boardIp`
- `mediaName`
- `mediaUrl`
- `imageKind`
- `imageUrl`
- `imageOriginal`
- `raw`
- `createdAt`
- `updatedAt`

Indexes cover `dedupeKey`, `time`, `taskSession`, `summary`, `description`, and `mediaName`.

## UI

The first screen is the dashboard app, not a marketing page. It shows KPI tiles, filters, and the recent alarm table. Alarm details show the decoded image, normalized metadata, result properties, and raw JSON.

## Local LAN Operation

The app runs with `npm run dev -- -H 0.0.0.0` or `npm run start:lan` after build. AI Box tasks use an Alarm Listener URL such as:

```text
http://<dashboard-lan-ip>:3000/api/webhooks/aibox
```

## Constraints

- Use MongoDB, not Firebase.
- Do not extend the existing `VideoAlarmSystem` project.
- Store large base64 images as local files instead of embedding them in MongoDB.
- Keep raw payloads for debugging because AI Box payload fields vary by task.
- Treat `Not Permitted, Trial them` AI Box tasks as preview-only unless they produce real webhook payloads.
