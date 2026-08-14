// ezuikit-js 9.x xuất bản không kèm khai báo TypeScript. Khai báo ở đây chỉ
// mô tả đúng phần dashboard dùng tới — cố gắng mô tả hết API của thư viện sẽ
// thành tài liệu sai lệch khi họ đổi phiên bản.

declare module "ezuikit-js" {
  export interface EZUIKitPlayerOptions {
    /** id của thẻ chứa; thư viện tự tìm bằng document.getElementById. */
    id: string;
    /** accessToken EZVIZ (dự án dùng token tài khoản con). */
    accessToken: string;
    /** ezopen://<mã xác minh>@open.ezviz.com/<serial>/<kênh>[.hd].live|rec */
    url: string;
    width?: number;
    height?: number;
    /** Bộ giao diện dựng sẵn: "simple" | "pcLive" | "pcRec" | "security" | "voice" … */
    template?: string;
    /** Mã xác minh của camera bật mã hoá. KHÔNG đặt trong url. */
    validCode?: string;
    /** Region: mặc định thư viện trỏ open.ys7.com (CN), phải đổi nếu khác. */
    env?: { domain: string };
    /** 0 kéo giãn, 1 giữ tỉ lệ vừa khung, 2 giữ tỉ lệ phủ kín. */
    scaleMode?: 0 | 1 | 2;
    /** Bật/tắt âm thanh lúc khởi tạo. */
    audio?: 0 | 1;
    /** Tự phát ngay khi khởi tạo (mặc định bật). */
    autoplay?: boolean;
    /** Ngôn ngữ giao diện. CHỈ "zh" (mặc định) hoặc "en" — mã khác gây lỗi. */
    language?: "zh" | "en";
    /** Đè từ điển của các widget con, khoá ngoài cùng là mã ngôn ngữ. */
    locales?: Record<string, Record<string, string>>;
    [key: string]: unknown;
  }

  export class EZUIKitPlayer {
    constructor(options: EZUIKitPlayerOptions);
    play(): Promise<unknown>;
    stop(): Promise<unknown>;
    destroy(): Promise<unknown>;
    /**
     * Nạp khoá giải mã cho camera bật mã hoá. Chỉ có tác dụng SAU khi player
     * đã dừng vì mã hoá — tuỳ chọn `validCode` lúc khởi tạo không thay được.
     */
    setSecretKey(code: string): unknown;
    /** Kênh sự kiện: on("message", (text, type) => …), type "validateCodeError". */
    eventEmitter: {
      on(event: string, handler: (text: string, type: string) => void): void;
      off(event: string, handler: (text: string, type: string) => void): void;
    };
  }

  export default EZUIKitPlayer;
}
