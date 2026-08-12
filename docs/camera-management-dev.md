# Camera trực tiếp + tua lại — chạy dev harness

Tính năng camera (lưới trực tiếp, xem 1 cam WebRTC, tua lại NVR) cần **MediaMTX**
chạy cạnh dashboard. Spec: `docs/superpowers/specs/2026-08-11-camera-management-playback-design.md`.

## Kiến trúc tóm tắt

```
Camera RTSP (HEVC) → ffmpeg transcode H.264 720p → MediaMTX path cam01
  ├─ HLS  :8888  → lưới "Trực tiếp" (hls.js, trình duyệt gọi thẳng)
  ├─ WHEP :8889  → xem 1 cam WebRTC (trình duyệt gọi thẳng)
  ├─ API  :9997  → /api/cameras (trạng thái, Next proxy, loopback)
  ├─ Playback :9996 → /api/cameras/[code]/recordings + /playback (Next proxy, loopback)
  └─ Ghi hình fmp4 → ./recordings/cam01/…
```

Thêm/sửa/xoá camera **ngay trên giao diện** (tab Trực tiếp → ô "Thêm camera",
hover tile để Sửa/Xoá). Không sửa `mediamtx.yml` hay code nữa: camera lưu trong
Mongo collection `cameras`, dashboard tự đồng bộ path MediaMTX qua Control API.
Mỗi camera server tự sinh mã `camNN` (= tên path). Vì config API không bền qua
restart MediaMTX, cron gọi `POST /api/webhooks/cameras-sync` mỗi phút để nạp lại.

## Chạy lần đầu

1. Tải MediaMTX v1.20.0 (macOS arm64):

   ```bash
   curl -sL -o /tmp/mediamtx.tar.gz "https://github.com/bluenviron/mediamtx/releases/download/v1.20.0/mediamtx_v1.20.0_darwin_arm64.tar.gz"
   tar -xzf /tmp/mediamtx.tar.gz -C . mediamtx
   ```

   (Binary `mediamtx` đã gitignore.)

2. Tạo config từ mẫu rồi điền RTSP thật của camera:

   ```bash
   cp mediamtx.dev.example.yml mediamtx.dev.yml
   ```

   Cần `ffmpeg` trên PATH (`brew install ffmpeg`) vì camera phát HEVC — phải
   transcode H.264 mới xem được trên mọi trình duyệt (chi tiết trong file mẫu).

3. Chạy MediaMTX song song với dashboard:

   ```bash
   ./mediamtx mediamtx.dev.yml
   ```

4. `.env.local` — dùng mặc định là chạy (localhost); chỉ cần thêm khi khác cổng:
   `MEDIAMTX_API_URL`, `MEDIAMTX_PLAYBACK_URL`, `NEXT_PUBLIC_MEDIA_HLS_BASE`,
   `NEXT_PUBLIC_MEDIA_WEBRTC_BASE` (xem `.env.example`).

5. Mở `http://localhost:3000/camera`:
   - **Trực tiếp**: lưới HLS; bấm tile → WebRTC (tự fallback HLS nếu WebRTC không nối được).
   - **Xem lại**: chọn ngày → thanh tua hiện khoảng đã ghi → bấm mốc bất kỳ để phát;
     hết khoảng liền mạch tự nhảy khoảng kế.
   - **Giao diện Box**: iframe giao diện AI Box như cũ.

## Kiểm tra nhanh khi trục trặc

```bash
# Path có ready không (nguồn RTSP nối được chưa)?
curl -s http://127.0.0.1:9997/v3/paths/list | python3 -m json.tool
# Đã ghi được khoảng nào chưa?
curl -s "http://127.0.0.1:9996/list?path=cam01"
```

- `ready: false` kéo dài → xem log MediaMTX; thường do RTSP sai user/pass/IP
  hoặc ffmpeg thiếu.
- Lưới đen nhưng `ready: true` → kiểm tra `NEXT_PUBLIC_MEDIA_HLS_BASE` đúng
  origin trình duyệt với tới được.
- Ghi hình: file fmp4 rơi vào `./recordings/cam01/`, xoá tự động theo
  `recordDeleteAfter`.

## Phase 2 (chưa làm — cần SSH server 222.255.181.96)

Cài MediaMTX systemd trên server, transcode `libx264`, mở UDP cho WebRTC,
nginx TLS cho media origin, retention theo đĩa thật, chuyển deploy dashboard
sang server mới. Sẽ có spec riêng.
