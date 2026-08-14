// Ngôn ngữ hiển thị của player EZUIKit.
//
// Thư viện chỉ đóng gói sẵn hai từ điển: `zh` (mặc định) và `en`. i18n của
// player chính tra thẳng `translations[currentLanguage][key]`, nên truyền một
// mã ngôn ngữ lạ như "vi" sẽ ném lỗi ngay lần dịch đầu tiên — KHÔNG đặt
// EZUIKIT_LANGUAGE thành "vi".
//
// Bù lại, các widget con (điều khiển xoay, ghi hình) dựng i18n riêng theo
// công thức `merge(từ_điển_gốc, options.locales)` với `defaultLocale =
// options.language`. Nhờ vậy có thể nhét tiếng Việt vào bằng cách ghi đè
// chính khoá "en". Những chuỗi nằm ngoài `locales` vẫn là tiếng Anh — đó là
// giới hạn của thư viện, không phải thiếu sót cấu hình.

/** Ngôn ngữ nền của player. Phải là "zh" hoặc "en" — xem giải thích ở trên. */
export const EZUIKIT_LANGUAGE = "en";

/**
 * Tiếng Việt đè lên từ điển "en" của các widget con. Khoá lấy từ từ điển gốc
 * của ezuikit-js 9.0.17; khoá lạ sẽ bị bỏ qua chứ không gây lỗi.
 */
export const EZUIKIT_LOCALES = {
  en: {
    GET_PTZ_STATUS: "Lấy trạng thái xoay hiện tại",
    GET_PTZ_STATUS_FAILED: "Chưa nạp được module giao diện, không lấy được trạng thái xoay",
    OPTION_PTZ_FAILED: "Chưa nạp được module giao diện, không điều khiển xoay được",
    MOBILE_HIDE_PTZ: "Trên điện thoại chỉ hiện điều khiển xoay khi xem toàn màn hình",
    MOBILE_PTZ_TIPS: "Dùng cụm điều khiển để chỉnh góc nhìn camera",
    PTZ_SPEED: "Tốc độ xoay",
    PTZ_FAST: "Nhanh",
    PTZ_MID: "Vừa",
    PTZ_SLOW: "Chậm",
    DEVICE_ZOOM: "Phóng to / thu nhỏ",
    DEVICE_FOCUS: "Chỉnh tiêu cự",
    close: "Đóng"
  }
} as const;
