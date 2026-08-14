# Camera EZVIZ — tích hợp và vận hành

Camera EZVIZ xem trực tiếp, xem lại và điều khiển PTZ ngay trong trang Camera,
đi qua EZVIZ Open Platform chứ không qua MediaMTX.
Thiết kế: `docs/superpowers/specs/2026-08-14-ezviz-camera-integration-design.md`.

## Khác gì camera RTSP

|  | Camera RTSP | Camera EZVIZ |
| --- | --- | --- |
| Đường truyền | MediaMTX trên server | EZVIZ Cloud |
| Ghi hình | Có, trên đĩa server | **Không** — chỉ xem lại bản EZVIZ lưu trên cloud |
| Xem lại | Thanh tua tự viết | Player EZUIKit |
| PTZ | Không | Có |
| Thêm/sửa/xoá | Trên dashboard | Ở tài khoản EZVIZ (dashboard chỉ đọc) |

Hai loại dùng chung collection `cameras`, phân biệt bằng trường `source`.

## Cài đặt lần đầu

1. **Lấy khoá.** Vào console EZVIZ Open Platform, tạo ứng dụng, lấy `AppKey` và
   `AppSecret`.

2. **Nhập vào dashboard.** Cài đặt → thẻ "Camera EZVIZ" → điền AppKey +
   AppSecret → Lưu. Region được dò tự động ở lần gọi đầu tiên và ghim lại
   (tài khoản của dự án nằm ở US: `https://iusopen.ezvizlife.com`).

3. **Chọn nguồn token phát.** Token phát phải xuống trình duyệt. Mặc định
   dashboard chỉ dùng token tài khoản con; nhưng tài khoản con của dự án
   **không giải mã được luồng** nên hiện phải bật công tắc "Dùng token tài
   khoản chính để phát hình" trong Cài đặt (đọc kỹ phần rủi ro bên dưới).
   Chưa bật và cũng chưa có tài khoản con thì camera báo lỗi và không phát.

4. **Thêm tên miền vào danh sách hợp lệ của EZVIZ.** Vào console EZVIZ Open
   Platform, thêm domain chạy dashboard (vd `https://aibox.zootech.asia`). Bỏ
   qua bước này thì xem trực tiếp vẫn chạy nhưng **xem lại cloud bị chặn CORS**.

5. **Đưa camera vào tài khoản EZVIZ** — một trong hai cách:
   - Thêm bằng app EZVIZ trên điện thoại (cùng tài khoản với AppKey), rồi bấm
     **Đồng bộ EZVIZ** trên trang Camera.
   - Hoặc gọi `POST /api/ezviz/devices` với `deviceSerial` + `validateCode`.

6. **Nhập khoá giải mã.** `device/list` không trả khoá này nên phải nhập tay:
   tile camera hiện nút **Nhập mã xác minh**. Điền **mật khẩu mã hoá video đặt
   trong app EZVIZ** — không phải mã in trên tem, trừ khi bạn chưa từng đổi
   (xem mục "Camera bật mã hoá" bên dưới).

## Vận hành

- **Đồng bộ**: nút "Đồng bộ EZVIZ" trên trang Camera, và cron
  `POST /api/webhooks/cameras-sync` chạy mỗi phút cũng đồng bộ kèm.
- Thiết bị biến mất khỏi tài khoản EZVIZ **không bị xoá** khỏi dashboard, chỉ
  chuyển offline — một lần API lỗi không được cuốn đi cấu hình.
- Đổi AppKey/AppSecret sẽ tự xoá token + region đã ghim.
- Ghim nhầm region: Cài đặt → "Xoá cache token và region".

## Lỗi thường gặp

| Hiện tượng | Nguyên nhân | Xử lý |
| --- | --- | --- |
| "Chưa cấu hình EZVIZ trong Cài đặt" | Thiếu AppKey/AppSecret | Bước 2 |
| "Chưa tạo tài khoản con EZVIZ" | Thiếu `ezvizRamAccountId` | Bước 3 |
| "Cấu hình EZVIZ sai" | AppKey/AppSecret sai, hoặc sai region | Nhập lại; xoá cache region |
| "Camera bật mã hoá — cần nhập mã xác minh" | Thiếu `ezvizVerifyCode` | Bước 5 |
| "Thiết bị không còn trong tài khoản EZVIZ" | Đã gỡ khỏi app EZVIZ | Thêm lại rồi đồng bộ |
| Camera offline dù app EZVIZ vẫn xem được | `device/list` trả `status: 0` | Chờ đồng bộ kế tiếp |

## Trạng thái tính năng

| Tính năng | Trạng thái |
| --- | --- |
| Đồng bộ thiết bị, trạng thái online | Chạy, đã kiểm trên thiết bị thật |
| Xem trực tiếp (lưới + toàn khung) | Chạy, HD |
| PTZ 8 hướng + zoom | Chạy, đã xác minh camera xoay và dừng đúng |
| Xem lại — danh sách khoảng có video | Chạy |
| Xem lại — phát video | **Chưa xác minh được ở máy dev** (xem bên dưới) |

### Xem lại cloud cần tên miền được EZVIZ cho phép

Player gọi `api/service/appKey/get` để dựng phiên xem lại cloud, và EZVIZ chặn
lệnh này theo tên miền gọi tới:

```
Access to fetch at 'https://iusopen.ezvizlife.com/api/service/appKey/get?...'
from origin 'http://localhost:3050' blocked by CORS policy
```

Xem trực tiếp không cần lệnh này nên chạy bình thường ở máy dev; chỉ xem lại bị
chặn. Cách xử lý: vào console EZVIZ Open Platform, thêm tên miền production
(`https://aibox.zootech.asia`) vào danh sách miền hợp lệ của ứng dụng, rồi thử
lại trên production.

Còn một điểm chưa chốt được vì lỗi CORS chặn trước: tham số `?begin=` trong URL
`ezopen` là `yyyyMMddHHmmss` **không mang múi giờ**. Code đang gửi theo giờ máy
người xem (camera và người xem cùng ở VN). Nếu sau khi mở miền mà vẫn báo
`420003 未找到录像片段` thì thử đổi sang giờ UTC trong `formatEzopenTime`.

## Camera bật mã hoá — điểm dễ mất thời gian nhất

Có **hai bí mật khác nhau**, đừng nhầm:

| Bí mật | Dùng cho | Ví dụ |
| --- | --- | --- |
| Mã xác minh in trên tem | Gọi API (`live/address/get`, `device/add`) | `XSPEFT` |
| Mật khẩu mã hoá đặt trong app EZVIZ | **Giải mã luồng video** | do người dùng đặt |

Dashboard cần loại thứ hai. Nhập mã trên tem thì API vẫn nhận nhưng player báo
`设备已加密` và không lên hình. Nếu chưa từng đổi mật khẩu mã hoá thì hai giá
trị này trùng nhau — đó là lý do nhiều hướng dẫn chỉ nhắc tới mã trên tem.

Quan trọng hơn, thư viện `ezuikit-js` 9.0.17 **không** dùng tuỳ chọn `validCode`
lúc khởi tạo dù tài liệu nói vậy. Bộ giải mã trả `nErrorCode 5`, player phát sự
kiện rồi tự dừng chờ khoá; đường duy nhất nạp khoá là gọi `setSecretKey()` sau
khi player đã vào trạng thái chờ. Chi tiết trong `src/components/camera/ezviz-player.tsx`.

## Ngôn ngữ hiển thị của player

Thư viện `ezuikit-js` mặc định hiển thị **tiếng Trung** và chỉ đóng gói sẵn hai
từ điển: `zh` và `en`. **Không đặt `language: "vi"`** — i18n của player chính
tra thẳng `translations[currentLanguage][key]` nên mã ngôn ngữ lạ sẽ ném lỗi
ngay lần dịch đầu.

Cấu hình đang dùng (`src/components/camera/ezviz-locale.ts`):

- `language: "en"` để bỏ tiếng Trung.
- `locales` đè tiếng Việt lên chính khoá `"en"`. Cách này ăn được vì các widget
  con dựng i18n theo `merge(từ_điển_gốc, options.locales)`.

Kết quả đo trên giao diện: quét toàn trang cả hai tab, **0 ký tự Trung**, kể cả
trong `title` và `aria-label`. Muốn dịch thêm chuỗi nào thì thêm khoá vào
`EZUIKIT_LOCALES`; khoá không tồn tại bị bỏ qua chứ không gây lỗi.

## Chế độ token tài khoản chính

Mặc định dashboard chỉ phát bằng token **tài khoản con**. Tài khoản con của dự
án không giải mã được luồng, và EZVIZ **không có API đọc lại policy** để dò cho
đúng tên quyền (`policy/set` nhận cả tên bịa và trả 200, `ram/policy/get` không
tồn tại).

Vì vậy Cài đặt có công tắc **"Dùng token tài khoản chính để phát hình"**, mặc
định tắt. Bật nó thì token có quyền trên toàn bộ tài khoản EZVIZ được gửi xuống
trình duyệt: ai mở DevTools trên dashboard cũng đọc được và dùng lại được trong
7 ngày. Chỉ bật khi dashboard chỉ có người tin cậy truy cập.

## Ghi chú kỹ thuật

Những điểm sai lệch với tài liệu EZVIZ, đã kiểm chứng trên thiết bị thật:

- Host trong URL `ezopen://` là `open.ezviz.com`, **khác** domain API của region.
- Camera bật mã hoá chỉ dùng được `protocol=1` (ezopen). HLS/RTMP/FLV trả
  `60019` — nên **không** kéo được luồng EZVIZ về MediaMTX.
- `video/by/time` nhận **epoch milliseconds**; chuỗi `yyyy-MM-dd HH:mm:ss` như
  tài liệu ghi bị trả `10001`.
- Nguồn xem lại là cloud (`recType=2`); thẻ nhớ (`recType=1`) có thể rỗng.
- Gọi sai endpoint, EZVIZ trả trang HTML Tomcat chứ không phải JSON.
