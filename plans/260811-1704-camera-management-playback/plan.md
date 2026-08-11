# Plan: Camera management + playback (Phase 1)

Spec: `docs/superpowers/specs/2026-08-11-camera-management-playback-design.md`
Branch: `feat/camera-management-playback`

Approach A (lean on MediaMTX playback server), HLS+WebRTC live, fixed camera config,
continuous timeline. Camera is HEVC → ffmpeg transcode to H.264 720p. Verified live
against MediaMTX v1.20.0 in scratchpad (`mediamtx.dev.yml` pulling the real camera).

## Build order (dependency-first)

### A. Foundation — pure, unit-tested (`src/lib/aibox/`)
- [x] `cameras.ts` (+test) — `CAMERAS` list + `getCamera(code)` allowlist
- [x] `media-endpoints.ts` (+test) — env accessors + URL builders (HLS/WHEP live, RFC3339 encode, playback query)
- [x] `recording-timeline.ts` (+test) — `/list` ranges → timeline, gaps, timestamp→{start,duration} window, clamp/merge
- [x] `webrtc-whep-reader.ts` — vendored MediaMTX `MediaMTXWebRTCReader` (MIT), ESM export

### B. API routes (thin proxy, cookie-auth via existing middleware, `code` allowlisted)
- [x] `GET /api/cameras` — list + `ready` status from `:9997/v3/paths/list`
- [x] `GET /api/cameras/[code]/live` — `{ hls, webrtc }` URLs
- [x] `GET /api/cameras/[code]/recordings?from&to` — proxy `:9996/list`, rewrite url → our playback proxy
- [x] `GET /api/cameras/[code]/playback?start&duration&format` — stream `:9996/get`, forward Range

### C. Service
- [x] `src/services/camera-client.ts` (+test) — typed fetchers

### D. Components (`src/components/camera/`)
- [x] `hls-player.tsx` — hls.js + Safari-native, destroy on unmount
- [x] `webrtc-player.tsx` — wraps whep reader, close on unmount
- [x] `camera-grid.tsx` — HLS tiles, click → single
- [x] `camera-single-view.tsx` — WebRTC + HLS fallback
- [x] `recording-timeline.tsx` — scrubber (ranges + gaps)
- [x] `playback-view.tsx` — date/time picker + timeline + `<video>` from playback proxy
- [x] `src/app/camera/page.tsx` — tabbed shell: Trực tiếp / Xem lại / Giao diện Box

### E. Config & docs
- [x] `.env.example` + local `.env.local` additions (MEDIAMTX_* + NEXT_PUBLIC_MEDIA_*)
- [x] `.gitignore`: `mediamtx.dev.yml`, recordings dir
- [x] `mediamtx.dev.example.yml` (committed, placeholder creds, documents transcode)
- [x] `docs/camera-management-dev.md` — how to run the dev harness

## Verify
- [x] `npm test` green (new unit tests)
- [x] `npm run lint` clean
- [x] Browser: grid live plays, single-cam WebRTC plays, playback scrub is continuous
- [x] Screenshots as proof

## Then
- [x] Adversarial code-review workflow over the diff — 9 van de that (1 critical gitignore nuot route file), da sua het o af18f37
- [x] Update spec/plan status; summarize; Phase 2 (server provisioning) is a separate spec

## Deferred to Phase 2 (needs SSH to 222.255.181.96)
MediaMTX systemd + retention/disk, UDP for WebRTC + nginx TLS media origin + live-stream
auth, migrate dashboard deploy to the new server.
