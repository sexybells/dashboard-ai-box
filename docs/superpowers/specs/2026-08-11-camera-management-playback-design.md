# Camera management + playback (live grid + NVR replay)

**Date:** 2026-08-11
**Status:** Approved design — Phase 1 (feature in repo)
**Author:** brainstorming session

## Goal

Add a camera section to the dashboard that can (1) watch cameras live — a grid of
all cameras and a low-latency single-camera view — and (2) replay recorded footage
by scrubbing a timeline (NVR-style "tua lại"). RTSP has no seeking, so a recording
layer separate from the SE5 AI Boxes acts as the NVR: it pulls RTSP, records to
disk, and serves seekable playback. That layer is **MediaMTX**.

Non-goals (Phase 1): provisioning the production server, per-camera permissions,
event tagging on recordings, camera CRUD from the UI.

## Decisions (from brainstorming)

- **Phasing:** Phase 1 builds the feature in this repo, verified locally against a
  local MediaMTX and the real RTSP camera. Phase 2 (separate spec) provisions
  MediaMTX on `222.255.181.96` and migrates the dashboard deploy there.
- **Live transport:** HLS for the grid, WebRTC (WHEP) for single-camera low latency,
  with HLS fallback.
- **Camera list:** fixed config (no UI CRUD). Cameras are defined in `mediamtx.yml`
  and named in a repo config module.
- **Playback:** continuous timeline — scrub across 10-minute segments seamlessly.
- **Architecture (Approach A):** lean on MediaMTX's built-in playback server. **No**
  `recordings` Mongo collection, **no** `segment-complete` webhook, **no** retention
  cron. Next.js API routes are a thin authenticated proxy over MediaMTX's
  localhost-only ports.

Rationale for Approach A over the original handoff (Approach B): MediaMTX's playback
server already answers "what video covers time T, give me the bytes" by reading the
disk directly and concatenating segments. A Mongo segment index would duplicate that,
require filename time-parsing, and introduce a retention-sync problem (MediaMTX deletes
files but Mongo docs wouldn't follow) that the handoff itself flagged as unsolved.

## Architecture

```
Camera RTSP (HEVC) ─▶ ffmpeg transcode ─▶ MediaMTX path cam01 (H.264 720p)
                       (H.264, videotoolbox/                │
                        libx264, downscale 720p)            ├─ HLS      :8888  (grid live, hls.js)
                                                            ├─ WebRTC   :8889  (single-cam, WHEP)
                                                            ├─ Playback :9996  (/list, /get) [127.0.0.1]
                                                            ├─ API      :9997  (path status)  [127.0.0.1]
                                                            └─ Recording → disk (fmp4 segments)

Browser ──▶ Next.js app
              ├─ control plane: /api/cameras/* proxy 9996/9997 (cookie-auth)
              └─ media plane:   HLS/WebRTC loaded from NEXT_PUBLIC_* origin
```

### Transcoding (HEVC → H.264) — required

The real camera streams **HEVC/H.265** (verified via ffprobe: 2304×1296@15, path label
"h264" is misleading). HEVC is not usable across browsers: **WebRTC carries no HEVC in
Chrome/Firefox**, and HLS/`<video>` HEVC only plays on Safari or machines with hardware
HEVC decode. MediaMTX does not transcode. So each camera path runs an **ffmpeg** step
(via MediaMTX `runOnInit`, restart on exit) that decodes HEVC, encodes **H.264**,
downscales to **1280×720@15** (plenty for monitoring; light on CPU/disk/bandwidth), drops
audio (`-an` — not needed, and the camera's audio timestamps are non-monotonic), and
republishes into the same path. Everything downstream (HLS, WebRTC, recording, playback)
is then H.264 and plays everywhere. Dev encoder: `h264_videotoolbox` (HW). Prod:
`libx264 -preset veryfast`. This adds real CPU cost to size for in Phase 2.

**Two planes.** The *control plane* (camera list, recording ranges, playback bytes)
flows through authenticated Next.js API routes that proxy MediaMTX's ports, which bind
`127.0.0.1` only. The *live media plane* (HLS/WebRTC — high-bandwidth, continuous) is
loaded by the browser directly from a media origin whose base URLs come from
`NEXT_PUBLIC_*` env vars: `http://localhost:8888/8889` in dev, an nginx-protected
origin in Phase 2.

### MediaMTX playback server (verified against docs)

- `GET :9996/list?path=<code>&start=<RFC3339>&end=<RFC3339>` →
  `[{ start: RFC3339, duration: seconds, url }]` — the recorded ranges (timeline data).
- `GET :9996/get?path=<code>&start=<RFC3339>&duration=<seconds>&format=fmp4|mp4` →
  a continuous fMP4 stream spanning the window, native to `<video>`. Seek by
  re-requesting with a new `start`. All params URL-encoded.

Sources: https://mediamtx.org/docs/usage/playback , https://mediamtx.org/docs/features/playback

### Verified endpoints (MediaMTX v1.20.0, tested against a live instance)

- **Camera status:** `GET :9997/v3/paths/list` → `{ items: [{ name, ready, online, tracks, ... }] }`.
  Use `ready` as the online signal.
- **HLS live:** `http://<host>:8888/<code>/index.m3u8` (multivariant; issues a one-time
  `?cookieCheck=1` redirect). hls.js on Chrome/Firefox, native `<video>` on Safari.
- **WebRTC live (WHEP):** endpoint `http://<host>:8889/<code>/whep`. The viewer flow (OPTIONS
  for ICE servers via `Link` header → recvonly transceivers → POST offer `application/sdp`
  → 201 answer + `Location` → trickle ICE via PATCH) is non-trivial, so we **vendor
  MediaMTX's official `MediaMTXWebRTCReader`** class (MIT, served at `:8889/<code>/reader.js`)
  as `src/lib/aibox/webrtc-whep-reader.ts` and wrap it in React. Public API:
  `new Reader({ url, onTrack, onError })` + `.close()`.
- **Playback:** `:9996/list` and `:9996/get` as above.

## Data & config — no new Mongo collection

Camera existence and online status come live from MediaMTX's API. Friendly names come
from a typed config module — the single source of display names, unit-tested.

```ts
// src/lib/aibox/cameras.ts
export interface CameraConfig { code: string; name: string; location?: string }
export const CAMERAS: CameraConfig[] = [
  { code: "cam01", name: "Camera cổng chính", location: "" },
];
export function getCamera(code: string): CameraConfig | undefined { /* allowlist lookup */ }
```

`code` MUST equal the MediaMTX path name in `mediamtx.yml`.

## Next.js API routes (control plane)

All under `/api/cameras`, `runtime = "nodejs"`. Auth is enforced automatically by the
existing middleware (`getAuthRouteDecision` treats any non-public `/api/*` as
unauthorized when logged out); no route is added to the public allowlist. Every route
validates `code` against the `CAMERAS` allowlist before touching MediaMTX (prevents
SSRF to arbitrary paths).

- `GET /api/cameras`
  → `CAMERAS` joined with live status from `GET :9997/v3/paths/list`
  → `[{ code, name, location, online }]`
- `GET /api/cameras/[code]/live`
  → `{ hls, webrtc }` URLs built from `NEXT_PUBLIC_MEDIA_*` env
- `GET /api/cameras/[code]/recordings?from=&to=`
  → proxies MediaMTX `/list`; rewrites each `url` to our own `/playback` proxy so the
    browser never calls MediaMTX directly
- `GET /api/cameras/[code]/playback?start=&duration=&format=`
  → **streams** MediaMTX `/get` back to the client, forwarding the `Range` request
    header and the upstream content-type/accept-ranges so `<video>` seeking works

### Env

```
MEDIAMTX_API_URL=http://127.0.0.1:9997        # server-side only
MEDIAMTX_PLAYBACK_URL=http://127.0.0.1:9996    # server-side only, proxied by Next
NEXT_PUBLIC_MEDIA_HLS_BASE=http://localhost:8888
NEXT_PUBLIC_MEDIA_WEBRTC_BASE=http://localhost:8889
```

## Frontend — tabbed `/camera`

`src/app/camera/page.tsx` becomes a tabbed client shell with three tabs:

- **Trực tiếp** — `camera-grid`: one HLS tile per camera; clicking a tile opens the
  single-camera WebRTC view (HLS fallback).
- **Xem lại** — `playback-view`: date/time picker + `recording-timeline` scrubber
  (recorded ranges and gaps from `/recordings`) + a `<video>` sourced from the
  `/playback` proxy. Scrubbing to time T re-requests `/get` with a new `start`,
  giving continuous playback across 10-minute segments.
- **Giao diện Box** — the existing `camera-embed.tsx`, kept as-is.

Components (kebab-case, `src/components/camera/`):

- `hls-player.tsx` — reusable `<video>` + hls.js attach/detach (Safari plays HLS natively); `hls.destroy()` on unmount (React 19 StrictMode double-mount)
- `webrtc-player.tsx` — wraps the vendored `webrtc-whep-reader.ts`; `.close()` on unmount
- `camera-grid.tsx`, `camera-single-view.tsx`, `playback-view.tsx`, `recording-timeline.tsx`

Service: `src/services/camera-client.ts` — typed fetchers for `/api/cameras` and
`/recordings` (tested like the existing `*-client.test.ts`).

**New dependency:** `hls.js` (only new package; WebRTC is vanilla).

### Pure, unit-tested brain

Following the repo's `src/lib/aibox/*` + `*.test.ts` convention:

- `src/lib/aibox/recording-timeline.ts` — turn `/list` ranges into a renderable
  timeline, compute gaps, map a clicked timestamp → `{ start, duration }` request
  window, clamp to available footage, merge adjacent ranges. This is the core of
  continuous playback and is fully pure/testable (`recording-timeline.test.ts`).
- RFC3339 + URL-param builders for the MediaMTX proxy calls (tested).

## Auth & security

- Reuse existing cookie auth via middleware; new routes are protected automatically.
- Validate `code` against the `CAMERAS` allowlist before proxying (no SSRF).
- MediaMTX API/playback/HLS bind `127.0.0.1`; the browser reaches control/playback
  only through the authenticated Next proxy.
- **RTSP credentials live only in `mediamtx.yml` on the server — never committed.**
  `.env.example` gets placeholders; credentials are never logged.

## Local verification harness (Phase 1)

- `mediamtx.dev.yml` (not the prod config) pulling the real public camera
  (RTSP URL thật nằm trong `mediamtx.dev.yml`, gitignored) — reachable from the dev
  machine — into path `cam01`, recording fmp4 to a **gitignored** local dir.
- MediaMTX binary is downloaded, not committed (documented run command).
- Verify: grid shows live; single-cam WebRTC plays; recordings accrue on disk;
  `/recordings` lists ranges; scrubbing the timeline plays continuous fMP4. Capture
  screenshots via the browser preview tools as proof.
- Add `mediamtx.dev.yml` recordings dir and the MediaMTX binary to `.gitignore`.

## Testing

- **Unit (vitest):** `recording-timeline` logic, `cameras` config/allowlist, RFC3339
  param builders, `camera-client`.
- **Integration/manual:** the local harness above; browser-tool screenshots for grid,
  single view, and continuous playback.

## Phase 2 (separate spec — needs SSH to 222.255.181.96)

- Provision MediaMTX (systemd), recording dir + retention/disk sizing (`recordDeleteAfter`).
- Firewall: open the **UDP** port for WebRTC ICE (the NAT caveat documented in
  `camera-embed.tsx`); confirm MediaMTX advertises the server's public IP. If UDP is
  blocked, single-cam falls back to HLS (player already supports it).
- nginx TLS media origin for HLS/WebRTC + a live-stream auth strategy
  (nginx `auth_request` → Next session check, or short-lived signed token).
- Migrate the dashboard deploy off the shared server to `222.255.181.96` (pm2, Mongo,
  nginx, env, DNS).

## Open questions

- Phase 2 domain/subdomain for the media origin (e.g. `media.<domain>`), and whether
  the dashboard gets its own domain on the new server or reuses the current one.
- Disk budget on `222.255.181.96` → concrete retention days.
