# Cấu hình host AI Box từ dashboard (runtime)

Ngày: 2026-07-15 · Nhánh: main · Trạng thái: **spec — chờ duyệt**

## 1. Vấn đề

Host AI Box (dùng cho player WebRTC ở trang **Camera trực tiếp**) đang bị cố định trong
code: `src/components/camera-webrtc.tsx` dùng
`process.env.NEXT_PUBLIC_AIBOX_HOST || "http://192.168.1.26"`. Đây là biến env
**build-time** → muốn đổi host phải build lại + deploy lại. Cần cho phép đổi host **lúc
chạy** qua giao diện dashboard.

Host `BOX` hiện được dùng ở 4 chỗ trong `camera-webrtc.tsx`:
1. Tải script player: `${BOX}/dist/ZLMRTCClient.js`
2. Lấy danh sách camera: `${BOX}/api/alg_media_fetch`
3. URL signaling WebRTC: `${BOX}/webrtc?app=...&stream=...&type=play`
4. Link "Mở UI box": `${BOX}/#/preview/video` (và hiển thị ở footer)

## 2. Quyết định đã chốt (với user)

- **Lưu trữ:** MongoDB toàn cục — admin đặt một lần, mọi trình duyệt dùng chung.
- **Áp dụng:** ngay lập tức — không cần build lại / deploy lại / reload; trang Camera đọc
  host lúc mount.
- **Phạm vi:** chỉ host box (không gồm kênh mặc định — trang Camera đã đổi kênh runtime được).

## 3. Kiến trúc

```
Trang Cài đặt ──PUT /api/settings/box-host──► MongoDB (collection "settings")
                                                     │
Trang Camera ──GET /api/settings/box-host──► host ───┘ ──► WebRTC nối host mới
```

Kết nối WebRTC/fetch là **trình duyệt → box trực tiếp** (cùng LAN), nên giá trị host là mối
quan tâm phía client; server chỉ lưu và phát lại giá trị. "Áp dụng ngay" thỏa mãn vì trang
Camera là route riêng, App Router remount khi điều hướng → effect fetch lại host mới.

## 4. Thành phần

### 4.1 Model — `src/models/app-setting.ts` (mới)

Collection key/value chung tên `settings`:

```ts
interface AppSettingDocument {
  key: string;      // unique, index
  value: string;
  updatedAt: Date;  // timestamps
}
```

Host box lưu ở doc `key="boxHost"`. Dùng KV chung (thay vì doc riêng cho box) để card Cài đặt
sau này thêm setting khác không phải tạo model mới — vẫn một model, tối giản. Export theo
pattern hiện có: `mongoose.models.AppSetting || mongoose.model(...)`.

### 4.2 Helper thuần — `src/lib/aibox/box-settings.ts` (mới)

- `SETTING_KEY_BOX_HOST = "boxHost"`.
- `DEFAULT_BOX_HOST`: `process.env.AIBOX_HOST ?? process.env.NEXT_PUBLIC_AIBOX_HOST ?? "http://192.168.1.26"`
  (mặc định khi DB chưa có bản ghi; giữ tương thích deploy cũ đang set `NEXT_PUBLIC_AIBOX_HOST`).
- `normalizeBoxHost(input: string): string | null`
  - trim khoảng trắng;
  - nếu thiếu scheme thì thêm `http://`;
  - chỉ chấp nhận scheme `http`/`https`, phải có host (chấp nhận `ip:port`, ví dụ
    `192.168.1.26`, `192.168.1.26:8080`, `http://box.local`);
  - bỏ dấu `/` ở cuối;
  - trả `null` nếu rỗng hoặc không parse được thành URL hợp lệ.
  - Hàm thuần (không DOM, không I/O) → unit-test được.

### 4.3 Test — `src/lib/aibox/box-settings.test.ts` (mới)

Theo runner/kiểu test hiện có trong `src/lib/aibox/*.test.ts`. Ca test cho `normalizeBoxHost`:
- thêm `http://` khi thiếu scheme (`192.168.1.26` → `http://192.168.1.26`);
- giữ nguyên khi có scheme hợp lệ (`https://box.local`);
- bỏ dấu `/` cuối (`http://x/` → `http://x`);
- nhận `ip:port` (`192.168.1.26:8080` → `http://192.168.1.26:8080`);
- loại chuỗi rỗng / chỉ khoảng trắng → `null`;
- loại scheme không hợp lệ (`ftp://x`, `javascript:...`) → `null`.

### 4.4 API — `src/app/api/settings/box-host/route.ts` (mới)

`export const runtime = "nodejs";`

- `GET` → `{ ok: true, boxHost }` — đọc doc `boxHost` từ DB; không có thì trả `DEFAULT_BOX_HOST`.
- `PUT` — body `{ boxHost: string }`:
  - `normalizeBoxHost` → nếu `null` trả `400 { ok: false, error }`;
  - hợp lệ thì `upsert` doc `{ key: "boxHost", value }`;
  - trả `{ ok: true, boxHost }`.

Xác thực: xử lý tập trung ở `src/proxy.ts` (`getAuthRouteDecision`) — mọi `/api/*` không public
mà chưa đăng nhập → 401. Không cần guard riêng trong route.

### 4.5 Trang Camera — `src/components/camera-webrtc.tsx` (sửa)

- Bỏ module-const `BOX`. Thêm state `boxHost` (khởi tạo rỗng/`null`), fetch
  `/api/settings/box-host` lúc mount → set `boxHost`.
- Khi chưa có `boxHost`: hiện trạng thái "Đang tải cấu hình…"; chưa chạy các effect phụ thuộc host.
- 4 chỗ dùng `${BOX}` → `${boxHost}`. Các effect (tải script, lấy danh sách camera, signaling,
  link "Mở UI box", code ở footer) phụ thuộc `boxHost`.
- `DEFAULT_CHANNEL` giữ nguyên (ngoài phạm vi).
- Ghi chú kỹ thuật: `ZLMRTCClient.js` không phụ thuộc host (chỉ URL signaling dùng host), nên
  việc cache `window.ZLMRTCClient` từ host cũ khi đổi host không gây lỗi.

**Click khung video → mở host box (tab mới):**
- Trên khung video, thêm lớp overlay `<a href={boxHost} target="_blank" rel="noreferrer">`
  phủ toàn khung (`absolute inset-0`), hiện khi hover: nền tối mờ + icon + chữ "Mở giao diện box",
  con trỏ `cursor-pointer`. Click overlay → mở `${boxHost}` ở **tab mới** (giữ dashboard + phiên
  WebRTC). Overlay chỉ render khi đã có `boxHost`.
- **Bỏ thuộc tính `controls`** của `<video>`: overlay che thanh controls nên giữ lại sẽ xung đột
  click; luồng mosaic live (autoplay/muted) gần như không cần scrub/play-pause, và người dùng vào
  UI box để thao tác thật. Đây là thay đổi hành vi có chủ đích (ghi rõ để không âm thầm).
- Link "Mở UI box" ở góc trên **giữ nguyên** (trỏ `${boxHost}/#/preview/video`) — lối tắt song song.

### 4.6 Trang Cài đặt (sửa + 1 file mới)

- `src/components/settings/box-host-setting.tsx` (mới, client): card "AI Box" —
  ô nhập host, nút **Lưu**, báo lỗi validate inline, xác nhận "Đã lưu". Fetch giá trị hiện tại
  lúc mount (`GET`), `PUT` khi lưu; cập nhật lại giá trị hiển thị theo response.
- `src/components/settings-view.tsx` (sửa): render `<BoxHostSetting />` trong một `Card`
  (đặt cạnh card Webhook).

### 4.7 Env — `.env.example` (sửa)

Thêm dòng ghi chú `AIBOX_HOST=` (mặc định host box phía server; DB ghi đè khi có).

## 5. Xử lý lỗi

- Host sai định dạng → API `PUT` trả 400; UI Cài đặt hiện lỗi, không lưu.
- Camera `GET` host lỗi mạng → fallback `DEFAULT_BOX_HOST`; giữ hành vi hiện tại (nếu không
  cùng LAN, phần lấy danh sách camera vẫn báo "Không lấy được danh sách camera").

## 6. Không đụng tới

Việc footfall đang dở, các trang khác, đường face-dedup cũ. Chỉ **3 file sửa + 5 file mới**:
- Sửa: `camera-webrtc.tsx`, `settings-view.tsx`, `.env.example`.
- Mới: `models/app-setting.ts`, `lib/aibox/box-settings.ts`, `lib/aibox/box-settings.test.ts`,
  `api/settings/box-host/route.ts`, `components/settings/box-host-setting.tsx`.

## 7. Kiểm thử / nghiệm thu

- `box-settings.test.ts` pass; toàn bộ test `src/lib/aibox` không vỡ.
- `tsc` + `eslint` sạch trên file mới/sửa.
- Thủ công (user, do trang sau đăng nhập): đổi host ở Cài đặt → lưu OK → mở Camera thấy nối
  host mới; nhập host sai → hiện lỗi, không lưu.
- Thủ công: hover khung video hiện overlay "Mở giao diện box"; click → mở `${boxHost}` ở tab mới,
  đúng host vừa đổi trong Cài đặt.

## 8. Câu hỏi mở

- Không có. (Env fallback giữ cả `AIBOX_HOST` và `NEXT_PUBLIC_AIBOX_HOST` để không phá deploy cũ.)
