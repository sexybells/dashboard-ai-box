# Phase 2: Server 222.255.181.96 đã dựng xong — chờ 3 record DNS

Quyết định user 2026-08-12: domain **zootech.asia** (phương án B), retention **3 ngày**.
Main đã merge camera feature (`7c7a38e`) + push GitHub.

## Đã dựng trên 222.255.181.96 (Ubuntu 24.04, 4 CPU, 8GB, disk chung 92GB trống)

| Thành phần | Trạng thái |
|---|---|
| ffmpeg 6.1.1 (apt) | camera RTSP reachable từ server, transcode HEVC→H.264 720p15 1.2Mbps libx264, `-timeout` chống treo |
| MediaMTX v1.20.0 | `/usr/local/bin/mediamtx`, config `/usr/local/etc/mediamtx.yml` (chmod 600, chứa RTSP creds + viewer pass), systemd `mediamtx.service` enabled, `ready=true` |
| Ghi hình | `/data/recordings/cam01/`, fmp4 10 phút/segment, `recordDeleteAfter: 72h` (~40GB đỉnh) |
| Auth media | `authInternalUsers`: đọc cần `viewer:<pass trong .env server>`; loopback nặc danh chỉ publish/api/playback; `hls/webrtcTrustedProxies: [127.0.0.1]` chặn publish nặc danh xuyên Caddy |
| WebRTC | signaling qua Caddy (webrtc.zootech.asia→8889), media UDP `:8189` quảng bá IP public. UDP bị chặn thì UI tự fallback HLS |
| Mongo | container `aibox_mongo` (mongo:7, 127.0.0.1:27017, volume `aibox_mongo_data`), **977 docs migrate từ server cũ** (396 alarms, 579 webhook_events, 2 settings + index) |
| Dashboard | `/root/dashboard-ai-box` (main), `.env` chmod 600 (AIBOX_AUTH_SECRET copy từ server cũ, MEDIA_VIEWER_*, NEXT_PUBLIC bases = https://hls/webrtc.zootech.asia), pm2 `dashboard-ai-box` `next start -H 127.0.0.1 -p 3104`, `pm2 save`, pm2-root enabled |
| Caddy | 3 site thêm cuối `/etc/caddy/Caddyfile` (backup `.bak-before-aibox-*`): aibox→3104, hls→8888, webrtc→8889. Validate OK, reload OK. **Cert chưa phát hành được vì DNS chưa có** |

Verify server-side: login 200 (admin), `/api/cameras` → cam01 online:true, alarms trả data
migrate, playback `/list` có segment, ffmpeg ~36% một core (~9% máy).

## User cần làm (cutover)

1. **Thêm 3 record A** trong DNS zootech.asia → `222.255.181.96`:
   `aibox`, `hls`, `webrtc`. Caddy tự phát hành cert TLS-ALPN trong ~1 phút sau đó.
2. Mở `https://aibox.zootech.asia` đăng nhập kiểm tra (admin / mật khẩu hiện tại).
3. **Đổi URL webhook trong giao diện AI Box** →
   `https://aibox.zootech.asia/api/webhooks/aibox`.
4. (Ngày cutover) **Resync alarms mới phát sinh** trên server cũ từ lúc migrate:
   ```
   ssh root@187.124.226.230 'docker exec aibox_mongo mongodump --uri=mongodb://127.0.0.1:27017 --db=aibox_dashboard --gzip --archive' | ssh 222.255.181.96 'docker exec -i aibox_mongo mongorestore --uri=mongodb://127.0.0.1:27017 --drop --gzip --archive'
   ```
   (chạy từ máy Mac; --drop thay toàn bộ nên chạy TRƯỚC khi box bắn dữ liệu mới vào server mới)
5. Sau khi ổn: `ssh root@187.124.226.230 'pm2 delete dashboard-ai-box; pm2 save'` tắt bản cũ.

## Việc còn lại sau DNS

- Test end-to-end HTTPS: live grid + WebRTC (nếu cloud chặn UDP 8189 → sẽ thấy tự fallback HLS sau 8s) + tua lại.
- **Đổi mật khẩu admin dashboard** — vẫn là mặc định `123456` (`AIBOX_ADMIN_PASSWORD` trong `.env` server). Tồn tại từ trước, nhắc lần nữa.

## Câu hỏi mở

- Tên hiển thị thật cho cam01 (đang "Camera cổng chính" — hình là phòng họp).
- Server cũ 187.124.226.230 sau cutover: giữ nginx/mongo cũ hay dọn?
