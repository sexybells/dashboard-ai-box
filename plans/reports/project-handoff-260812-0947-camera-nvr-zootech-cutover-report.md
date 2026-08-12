# HANDOFF: AiBoxDashboard — camera NVR đã xây xong, chờ cutover DNS

Ngày: 2026-08-12. Branch: `main@2fc0212` (đã push GitHub `sexybells/dashboard-ai-box` — repo PUBLIC, tuyệt đối không commit secrets).

## 1. Dự án là gì

Dashboard Next.js 16 + Mongoose nhận webhook cảnh báo từ AI Box SE5, hiển thị realtime (SSE),
thống kê footfall. Phiên 11–12/08 đã thêm **quản lý camera + xem lại video (NVR)**:

- `/camera` 3 tab: **Trực tiếp** (lưới HLS → bấm tile = WebRTC/WHEP, tự fallback HLS),
  **Xem lại** (thanh tua theo ngày, bấm mốc là phát, tự nhảy qua chỗ hở), **Giao diện Box** (iframe cũ).
- Kiến trúc "Approach A": **MediaMTX** làm NVR (pull RTSP 24/7, ghi fmp4, playback server
  `/list`+`/get` trả video theo mốc thời gian **trực tiếp từ đĩa** — KHÔNG có collection
  recordings trong Mongo, không webhook segment, không cron retention-sync).
- Next API `/api/cameras/*` = proxy mỏng cookie-auth trước MediaMTX (bind loopback);
  allowlist camera trong `src/lib/aibox/cameras.ts` (thêm cam = sửa file này + mediamtx.yml, code trùng tên path).
- Camera thật (EZVIZ `222.252.47.115:3000`) phát **HEVC dù URL ghi h264** → ffmpeg transcode
  H.264 720p15 trong `runOnInit`. Bắt buộc `-timeout 15000000` TRƯỚC `-i` kẻo ffmpeg treo
  vô hạn khi camera rớt mạng (đã dính thật).
- **Auth media**: MediaMTX `authInternalUsers` — đọc HLS/WHEP cần `viewer:<pass>`; creds chỉ
  phát qua `/api/cameras/[code]/live` (cookie-auth). Loopback nặc danh chỉ publish/api/playback;
  `hls/webrtcTrustedProxies` chặn publish nặc danh xuyên reverse proxy.

Tài liệu: spec `docs/superpowers/specs/2026-08-11-camera-management-playback-design.md`,
chạy dev `docs/camera-management-dev.md`, report Phase 1
`plans/reports/camera-management-playback-phase1-260812-0120-completion-report.md`,
report Phase 2 `plans/reports/camera-phase2-server-provisioning-260812-0131-report.md`.

## 2. Hạ tầng — 2 server (SSH đã có trong `~/.ssh/config` máy Mac)

**MỚI `222.255.181.96`** (Ubuntu 24.04, 4CPU/8GB, disk chung 92GB trống — server CHUNG với
dau/study-program-finder/cho-giao-dien/ledge, **Caddy sở hữu :443**, KHÔNG đụng):
- MediaMTX v1.20.0 systemd (`mediamtx.service`), config `/usr/local/etc/mediamtx.yml`
  (chmod 600 — chứa RTSP creds + viewer pass), ghi `/data/recordings` 10ph/segment giữ **72h** (~40GB đỉnh).
- Mongo container `aibox_mongo` (127.0.0.1:27017) — đã migrate 977 docs từ server cũ (11/08).
- Dashboard `/root/dashboard-ai-box` (main), pm2 `dashboard-ai-box` = `next start -H 127.0.0.1 -p 3104`
  (KHÔNG dùng port 3000 — bị cho-giao-dien chiếm), `.env` chmod 600 (AUTH_SECRET, MEDIA_VIEWER_*,
  NEXT_PUBLIC_MEDIA_*BASE=https://hls|webrtc.zootech.asia — NEXT_PUBLIC nướng lúc build, đổi là phải rebuild).
- Caddy: 3 site cuối `/etc/caddy/Caddyfile` — aibox→3104, hls→8888, webrtc→8889.
  **Cert CHƯA phát hành vì DNS chưa trỏ.** WebRTC media UDP :8189 (chưa test được — nếu cloud chặn, UI tự fallback HLS sau 8s).

**CŨ `187.124.226.230`**: bản dashboard cũ VẪN CHẠY tại `api-aibox.genieplatform.cloud`
(AI Box đang bắn webhook vào đây). Giữ nguyên tới khi cutover xong.

## 3. Việc còn lại (theo thứ tự)

1. **[USER] Thêm 3 record A** DNS zootech.asia → `222.255.181.96`: `aibox`, `hls`, `webrtc`.
   Caddy tự lấy cert (~1 phút).
2. Test end-to-end `https://aibox.zootech.asia`: login → lưới live → WebRTC (xem badge; nếu
   sau 8s nhảy HLS = UDP 8189 bị chặn, chấp nhận được) → tua lại.
3. **[USER] Đổi webhook AI Box** → `https://aibox.zootech.asia/api/webhooks/aibox`.
4. Resync Mongo lần cuối NGAY TRƯỚC bước 3 (lệnh trong report Phase 2 — `--drop` thay toàn bộ,
   chạy trước khi box bắn data vào server mới).
5. Tắt bản cũ: `ssh root@187.124.226.230 'pm2 delete dashboard-ai-box; pm2 save'`.
6. **Đổi mật khẩu admin** — vẫn mặc định `123456`: đặt `AIBOX_ADMIN_PASSWORD` trong
   `/root/dashboard-ai-box/.env` (server mới) rồi `pm2 restart dashboard-ai-box`.

## 4. Trạng thái repo local (máy Mac)

- `main` sạch về code camera; branch `feat/camera-management-playback` đã merge, có thể xoá.
- **20 file dirty CÓ SẴN TỪ TRƯỚC** (không thuộc phiên này, đừng vứt): footfall/visitor
  uncommitted (`src/app/api/footfall/`, `footfall-view.tsx`, `footfall-stats.*`, sửa
  `alarms/route.ts`, `mongodb.ts`…) + plans/docs cũ chưa track. Cần quyết: commit hay bỏ.
- Plans dở từ trước: `260716-1414-configurable-aibox-host` (15/21 todo, 71%),
  `260714-1702-unique-visitor-face-dedup` (worker Python không deploy, nav `/visitors` đang ẩn).
- Dev harness local: MediaMTX + config + recordings nằm trong scratchpad session (sẽ mất) —
  tái tạo theo `docs/camera-management-dev.md` + `mediamtx.dev.example.yml`. Dev server dùng
  launch config `dev-3050` (port 3000 local bị project khác chiếm).

## 5. Câu hỏi mở

- Tên hiển thị thật cho `cam01` (đang "Camera cổng chính", hình thực tế là phòng họp).
- Server cũ sau cutover: dọn nginx/mongo/repo cũ hay giữ?
- 20 file dirty footfall/visitor trên máy Mac: commit tiếp hay huỷ?
- Có thêm camera mới không (ảnh hưởng CPU transcode ~0.4 core/cam + disk ~13GB/ngày/cam)?
