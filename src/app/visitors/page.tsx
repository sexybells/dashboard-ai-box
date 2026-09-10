import { FootfallView } from "@/components/footfall-view";
import { VisitorCountsView } from "@/components/visitor-counts-view";

/**
 * Bắt buộc render theo từng request, KHÔNG prerender lúc build.
 *
 * Hai app pm2 (`dashboard-ai-box` :3104 và `dashboard-ai-box-ip` :3105) chạy
 * `next start` trên CÙNG một thư mục, tức cùng một bản build `.next`. Nếu trang
 * này là static thì `process.env` bên dưới bị "nướng" vào lúc build và cả hai
 * app sẽ nhận đúng một giá trị — công tắc coi như vô hiệu. Render động thì biến
 * môi trường được đọc từ tiến trình đang chạy, nên mỗi app tự quyết một kiểu,
 * y như cách `MONGODB_URI` đang được đặt riêng trong tham số pm2.
 */
export const dynamic = "force-dynamic";

/**
 * Trang Lưu lượng khách có hai bản, chọn bằng env `VISITORS_VIEW`:
 *
 * - `footfall`: đếm lượt khách trực tiếp từ sự kiện People Counting của box
 *   (1 vào + 1 ra = 1 lượt, ghép theo từng camera từng ngày).
 * - mặc định: bản cũ, đọc bảng tổng hợp `visitor_daily_counts` do cron
 *   /api/webhooks/headcount-forward ghi mỗi 15 phút.
 *
 * Để hai bản song song vì site đối tác (:3104) lấy số từ đúng bảng mà cron gửi
 * đi, nên phải nhìn cùng một nguồn với thứ đã gửi.
 */
export default function VisitorsPage() {
  return process.env.VISITORS_VIEW === "footfall" ? <FootfallView /> : <VisitorCountsView />;
}
