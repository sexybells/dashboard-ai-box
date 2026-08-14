# Tích hợp camera EZVIZ vào dashboard — thiết kế

Ngày: 2026-08-14
Trạng thái: đã duyệt thiết kế, chờ kế hoạch triển khai

## Mục tiêu

Cho phép dashboard xem **trực tiếp**, **xem lại** và **điều khiển PTZ** camera
EZVIZ qua EZVIZ Open Platform, sống chung một trang Camera với camera RTSP hiện
có (MediaMTX) chứ không tách thành module riêng.

Ngoài phạm vi:

- Ghi hình camera EZVIZ về đĩa server.
- Thanh tua tự viết (`recording-timeline`) cho camera EZVIZ — dùng UI tua của EZUIKit.
- Quản lý sub-account EZVIZ trên giao diện (lần đầu tạo bằng script/tay).
- Đàm thoại 2 chiều, cảnh báo chuyển động từ EZVIZ.

## Thực nghiệm đã làm (2026-08-14)

Dò trên tài khoản thật, camera thật `BE4583385` (CS-H6c-R105-1L3WF). Những điều
dưới đây là **kết quả đo được**, không phải đọc tài liệu:

| Hạng mục | Kết quả |
| --- | --- |
| Domain API | `https://iusopen.ezvizlife.com` (region US). CN/EU/SGP/India trả `10017 AppKey doesn't exist` |
| `token/get` | Trả `accessToken`, `expireTime` (epoch ms, ~7 ngày) và **`areaDomain`** |
| `device/list` | Trả `deviceSerial`, `deviceName`, `deviceType`, `status` (1 = online), `deviceVersion`, `model`. **Không** trả mã xác minh |
| `camera/list` | Trả `channelNo`, `channelName`, `status`, `isEncrypt`, `videoLevel` |
| `live/address/get` | `protocol=1` (ezopen) OK → `ezopen://<code>@open.ezviz.com/<serial>/1.hd.live` |
| `live/address/get` | `protocol=2/3/4` (HLS/RTMP/FLV) trả `60019` khi camera bật mã hoá → **không dùng được** |
| Mã hoá | `isEncrypt: 1` → mọi lệnh live/playback bắt buộc tham số `code` = mã xác minh trên tem |
| `device/capacity` | `support_ptz`, `ptz_left_right`, `ptz_top_bottom`, `ptz_preset` đều `"1"` |
| `video/by/time` | Cần **epoch milliseconds**; chuỗi `yyyy-MM-dd HH:mm:ss` bị `10001`. `recType=1` (thẻ nhớ) rỗng, `recType=2` (cloud) có clip loại `ALARM` |
| RTSP NAT của camera | Cổng có phản hồi nhưng `401 Unauthorized` với `admin:<mã xác minh>` → không cắm vào MediaMTX được |

Hệ quả thiết kế: **chỉ đường `ezopen` + EZUIKit là khả thi** cho camera bật mã
hoá. Phương án kéo HLS/RTMP về MediaMTX bị loại bằng thực nghiệm, không phải
bằng phỏng đoán.

## Kiến trúc

`appKey`/`appSecret` chỉ tồn tại phía server. Trình duyệt nhận `accessToken`
của **sub-account** (quyền hạn chế) và URL `ezopen://`. Lệnh PTZ đi qua route
Next để token chính không rời server.

```
Trình duyệt                     Next (server)                  EZVIZ Cloud
──────────                      ─────────────                  ───────────
ezuikit-js  ◀── token, url ───  /api/ezviz/token        ──▶  lapp/token/get
  ezopen://…1.hd.live                                        lapp/ram/token/get
  ezopen://…1.rec                /api/ezviz/sync        ──▶  lapp/device/list
                                                             lapp/camera/list
  nút PTZ   ────────────────▶   /api/ezviz/ptz          ──▶  lapp/device/ptz/start|stop
  tua lại   ────────────────▶   /api/ezviz/playback     ──▶  lapp/video/by/time
```

### Module mới

Theo lối sẵn có: logic thuần trong `src/lib/aibox/`, I/O trong route, fetcher
trong `src/services/`, component trong `src/components/camera/`.

| File | Trách nhiệm |
| --- | --- |
| `src/lib/aibox/ezviz-api.ts` | Client HTTP tới EZVIZ: `getToken`, `listDevices`, `listCameras`, `getLiveAddress`, `getRamToken`, `ptzStart/Stop`, `listPlaybackClips`. Chuẩn hoá lỗi thành `EzvizError { code, message }` |
| `src/lib/aibox/ezviz-token.ts` | Vòng đời token: đọc/ghi cache trong `settings`, quyết định refresh. Phần quyết định là **hàm thuần** để test |
| `src/lib/aibox/ezviz-devices.ts` | Thuần: map `device/list` + `camera/list` → doc `cameras`; dựng URL `ezopen://`; đổi epoch ms ↔ `Date` |
| `src/app/api/ezviz/token/route.ts` | Cấp token sub-account + URL ezopen cho một camera (cookie-auth) |
| `src/app/api/ezviz/sync/route.ts` | Đồng bộ danh sách thiết bị vào Mongo |
| `src/app/api/ezviz/devices/route.ts` | `POST` thêm thiết bị bằng serial + mã xác minh (`lapp/device/add`) |
| `src/app/api/ezviz/ptz/route.ts` | Proxy PTZ |
| `src/app/api/ezviz/playback/route.ts` | Danh sách khoảng đã ghi trên cloud |
| `src/services/ezviz-client.ts` | Fetcher client, theo mẫu `camera-client.ts` |
| `src/components/camera/ezviz-player.tsx` | Bọc `ezuikit-js`, dynamic import `ssr: false` |
| `src/components/camera/ptz-pad.tsx` | Cụm nút 8 hướng + zoom, giữ = start, nhả = stop |

### Thay đổi model `cameras`

Thêm trường, không tạo collection mới:

```ts
source: "rtsp" | "ezviz"   // mặc định "rtsp" cho doc cũ
rtspUrl?: string           // đang required → optional, chỉ bắt buộc khi source === "rtsp"
ezvizSerial?: string
ezvizChannel?: number      // mặc định 1
ezvizVerifyCode?: string   // mã xác minh; thiếu → camera ở trạng thái "chờ mã xác minh"
ezvizEncrypted?: boolean   // từ camera/list.isEncrypt
```

`code` vẫn là `camNN` do server sinh. Camera `source: "ezviz"` **không** được
đẩy path vào MediaMTX: `ensureCameraPath` / `deleteCameraPath` bỏ qua, và
`reconcileCameraPaths` (cron `POST /api/webhooks/cameras-sync`) phải lọc
`source: "rtsp"` — nếu không, cron sẽ cố tạo path cho camera không có `rtspUrl`.

### Cấu hình

Lưu trong collection `settings` (như `boxHost`), nhập từ trang Cài đặt — không
dùng biến môi trường, vì `appSecret` là bí mật và trang Cài đặt đã có sẵn lối vào.

| Khoá | Ý nghĩa |
| --- | --- |
| `ezvizAppKey` | AppKey |
| `ezvizAppSecret` | AppSecret, không bao giờ trả về client |
| `ezvizAreaDomain` | Ghim sau lần lấy token đầu tiên (từ `areaDomain` trong response) |
| `ezvizToken`, `ezvizTokenExpireAt` | Cache token chính |
| `ezvizRamAccountId` | Sub-account dùng để cấp token cho trình duyệt |

Lần lấy token đầu tiên chưa biết region: thử lần lượt các domain đã biết
(`iusopen`, `isgpopen`, `ieuopen`, `iindiaopen`, `open.ys7.com`), domain nào trả
`code 200` thì ghim vào `ezvizAreaDomain`. Các lần sau gọi thẳng domain đã ghim.

## Luồng chạy

### Đồng bộ thiết bị

Nút "Đồng bộ EZVIZ" trong tab Trực tiếp, đồng thời gộp vào cron `cameras-sync`.

- Serial mới → tạo doc `camNN`, `source: "ezviz"`, chưa có mã xác minh.
- Serial đã có → cập nhật tên + `online`.
- Serial biến mất khỏi EZVIZ → **không xoá**, chỉ đặt `online: false` và gắn
  nhãn "không còn trong tài khoản EZVIZ". Một lần gọi API lỗi không được phép
  xoá cấu hình của người dùng.

Mã xác minh không có trong API nên đồng bộ chỉ tự động được một nửa: camera mới
hiện trong lưới ở trạng thái **chờ mã xác minh**, admin điền một lần rồi mới
phát được. Lưu `ezvizVerifyCode` trong Mongo, chỉ gửi xuống client trong response
của `/api/ezviz/token` khi thực sự dựng URL phát — cùng mức bảo vệ mà `rtspUrl`
đang có (dashboard 1 admin, cookie-auth, HTTPS).

### Thêm thiết bị bằng serial

Form nhập `deviceSerial` + mã xác minh → `lapp/device/add` → chạy đồng bộ. Dùng
khi camera chưa nằm trong tài khoản. Người dùng cũng có thể thêm bằng app EZVIZ
trên điện thoại rồi bấm Đồng bộ; hai lối vào cùng dẫn tới một trạng thái.

### Trực tiếp

Tab Trực tiếp giữ nguyên lưới. Tile chọn player theo `source`:

- `rtsp` → `HlsPlayer` như hiện tại.
- `ezviz` → `EzvizPlayer`, url `ezopen://<code>@open.ezviz.com/<serial>/<channel>.hd.live`.

Bấm tile EZVIZ → single view kèm `PtzPad`.

### Xem lại

Tab Xem lại chọn camera trước, rồi rẽ nhánh theo `source`:

- `rtsp` → `PlaybackView` (MediaMTX) như cũ.
- `ezviz` → `EzvizPlayer` với url `.rec`, nguồn mặc định **cloud** (`recType=2`).
  `/api/ezviz/playback` trả các khoảng có clip để hiện ngày nào xem được.

### PTZ

`POST /api/ezviz/ptz` nhận `{ code, direction, speed, action: "start" | "stop" }`.
Server tra `ezvizSerial` từ `code`, gọi `lapp/device/ptz/start|stop`. Client giữ
chuột = start, nhả chuột / `mouseleave` / unmount = stop. **Bắt buộc gửi stop
trong cleanup của effect** — thiếu bước này camera quay mãi.

## Xử lý lỗi

| Mã EZVIZ | Xử lý |
| --- | --- |
| `10002` token hết hạn | Tự lấy token mới **một lần** rồi thử lại; vẫn hỏng → lỗi tiếng Việt, không lặp |
| `10001` tham số sai | Lỗi lập trình — log kèm endpoint, trả 500 |
| `10017` sai appKey | "Cấu hình EZVIZ sai, kiểm tra lại trong Cài đặt". Không retry |
| `60019` thiếu mã xác minh | Tile hiện "Cần mã xác minh" + nút mở form điền |
| `20002` thiết bị không tồn tại | Đánh dấu camera mất khỏi tài khoản |
| `20014`/`20018` offline / không thuộc tài khoản | Tile offline, không phá lưới |

Chưa cấu hình `ezvizAppKey` → toàn bộ phần EZVIZ ẩn, camera RTSP chạy bình thường.
Một camera EZVIZ hỏng không được làm hỏng lưới: mỗi tile tự chịu lỗi của nó.

## Kiểm thử

Vitest, theo mẫu `src/lib/aibox/cameras.test.ts`. Chỉ test hàm thuần:

- `ezviz-token`: quyết định refresh (còn hạn / sắp hết / đã hết / chưa có).
- `ezviz-devices`: map `device/list` + `camera/list` → doc (thêm mới, cập nhật,
  serial biến mất); dựng URL `ezopen://` cho live và rec, có và không có mã xác
  minh; đổi epoch ms ↔ `Date`.
- `ezviz-api`: parse `code`/`msg` thành `EzvizError`, kể cả khi EZVIZ trả HTML
  (đã gặp: endpoint sai trả trang lỗi Tomcat, không phải JSON).

Route và player kiểm bằng tay trên camera `BE4583385`: live lên hình, PTZ xoay
và **dừng** khi nhả chuột, xem lại phát được clip cloud.

## Rủi ro

- **Token trong trình duyệt.** Sub-account giới hạn thiệt hại, nhưng vẫn phải
  tạo sub-account trước khi lên production; nếu chưa có, code phải từ chối cấp
  token chính cho client thay vì âm thầm hạ cấp bảo mật.
- **Phụ thuộc script + WebSocket EZVIZ.** Nếu môi trường chặn, camera EZVIZ
  không xem được và không có đường lui (HLS đã bị mã hoá chặn).
- **`ezuikit-js` là thư viện bên thứ ba tải vào trang admin.** Ghim phiên bản,
  không dùng CDN.
- **Region ghim sai.** Nếu `ezvizAreaDomain` bị ghim nhầm, mọi lệnh hỏng —
  cần nút xoá cache token/domain trong Cài đặt.

## Câu hỏi còn treo

- Sub-account tạo bằng script tay lần đầu — script đó để ở đâu, `scripts/`?
- Camera EZVIZ có cần vào lưới NVR cố định (ô trống) như camera RTSP không, hay
  chỉ hiện khi đã có mã xác minh?
