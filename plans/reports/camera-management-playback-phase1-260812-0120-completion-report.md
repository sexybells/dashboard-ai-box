# Phase 1 hoàn tất: Camera trực tiếp + tua lại (NVR) — báo cáo tổng kết

Branch `feat/camera-management-playback`, 4 commit (`f8e7683` spec → `2361b32` feature
→ `af18f37` review fixes → plan). Spec: `docs/superpowers/specs/2026-08-11-camera-management-playback-design.md`.
Hướng dẫn chạy dev: `docs/camera-management-dev.md`.

## Đã giao

**Trang /camera 3 tab** (giữ nguyên iframe box cũ ở tab 3):
- **Trực tiếp**: lưới HLS (hls.js, Safari native) → bấm tile = xem 1 cam WebRTC/WHEP
  (vendor reader chính chủ MediaMTX, MIT), tự fallback HLS (đếm lỗi + timeout 8s).
- **Xem lại**: chọn camera + ngày → thanh tua NVR (dải = có ghi hình, click mốc bất kỳ,
  rơi chỗ hở tự nhảy khoảng kế) → phát fMP4 liên tục qua proxy, tự nhảy khoảng khi hết.

**Kiến trúc (Approach A — không thêm collection Mongo, không webhook)**:
- MediaMTX v1.20.0 làm NVR: pull RTSP 24/7, ghi fmp4, playback server /list + /get
  trả lời "video nào phủ mốc T" trực tiếp từ đĩa → không cần index/retention-sync.
- 4 API route Next proxy MediaMTX (bind loopback), cookie-auth middleware sẵn có,
  allowlist `code` từ `src/lib/aibox/cameras.ts` (thêm camera = sửa file này + mediamtx.yml).
- Camera thật phát **HEVC** (dù URL ghi h264) → ffmpeg transcode H.264 720p@15 trong
  `runOnInit` (videotoolbox dev / libx264 prod) — bắt buộc để Chrome/Firefox xem được.

## Verify

- 178 unit test pass, lint sạch, build production OK.
- Trình duyệt trên camera thật: lưới live (timestamp realtime), WebRTC badge,
  tua lại phát đúng mốc, ngày trống hiện "Chưa có ghi hình", console 0 lỗi.

## Review đối kháng (41 agent, 5 hướng × 2 skeptic/finding) — 9 vấn đề thật, đã sửa

1. **Critical**: `.gitignore` `recordings/` không neo → nuốt luôn `recordings/route.ts`
   khỏi git (deploy sạch sẽ 404 cả tab Xem lại). Đã neo `/recordings/` + commit file.
2. MediaMTX trả 404 cho khoảng trống → route từng map thành 502; giờ trả `ranges: []`.
3. Race response /list trễ khi đổi cam/ngày nhanh → guard số thứ tự request.
4. `<video>` tua lại thiếu onError → màn đen câm khi segment bị dọn; giờ báo + reset.
5. 1 render ghép code mới với cửa sổ phát cũ → reset ngay trong onChange.
6. WHEP chết hẳn (đường failed một phát) không bao giờ đủ ngưỡng fallback → timeout 8s.
7. Spec lộ IP camera công khai trong repo public → đã xoá.
8. Config mẫu MediaMTX bind-all + đọc/publish nặc danh → loopback, tắt RTMP/SRT.
9. 4 test thiếu (nhánh /get không format, start-inclusive, biên tolerance, fetcher).

Phát hiện vận hành thêm (ngoài review): ffmpeg treo vô hạn khi camera rớt kết nối →
`-timeout 15000000` trước `-i` để exit cho `runOnInitRestart` kéo lại; `localhost` bị
Chrome phân giải ::1 trong khi MediaMTX bind IPv4 → default đổi sang `127.0.0.1`.

## Chưa làm (Phase 2 — cần SSH 222.255.181.96, spec riêng)

- Cài MediaMTX systemd trên server, transcode libx264, retention theo đĩa thật.
- Mở UDP WebRTC + nginx TLS media origin + auth cho live stream (HLS/WHEP hiện chỉ
  an toàn vì bind loopback; ra Internet phải có lớp auth — đã ghi trong spec).
- Chuyển deploy dashboard từ server chung 187.124.226.230 sang 222.255.181.96.

## Câu hỏi mở

- Tên hiển thị thật cho `cam01` (đang đặt "Camera cổng chính") + vị trí lắp.
- Retention bao nhiêu ngày / dung lượng đĩa server mới.
- Domain cho media origin Phase 2 (vd `media.<domain>`).
