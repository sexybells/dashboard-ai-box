import { FACEIDCOUNT_SUMMARY, HEADCOUNT_SUMMARY } from "@/lib/aibox/event-types";
import {
  buildFaceIdCountPayload,
  countVisitPairs,
  type CameraTally
} from "@/lib/aibox/headcount-visits";
import { connectMongo } from "@/lib/mongodb";
import { AlarmModel } from "@/models/alarm";
import { VisitorDailyCountModel } from "@/models/visitor-daily-count";
import { randomUUID, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const FORWARD_TIMEOUT_MS = 15000;

/**
 * Số gửi đi = nền seed của ngày + số lượt ghép được từ HeadCount thật.
 *
 * Chủ ý của người vận hành: bản ghi seed được TÍNH NHƯ dữ liệu thật, phần box
 * gửi về cộng thêm lên trên. Nền lấy riêng từ các bản ghi mang tiền tố dưới đây
 * nên chạy bao nhiêu lần cũng ra cùng kết quả — nếu lấy cả bản tổng hợp của lần
 * chạy trước làm nền thì mỗi nhịp sẽ cộng dồn thêm một lần nữa.
 */
const SEEDED_FACEIDCOUNT_PREFIX = "unique:FAKE-FACEIDCOUNT-";

/**
 * Bản tổng hợp mỗi ngày một dòng, ghi đè tại chỗ. Nhờ nằm cùng camera và cùng
 * khung giờ với nhịp seed, phép `$max` của /api/face-count sẽ nhặt nó thay cho
 * nền seed, nên Tổng quan hiện đúng con số vừa gửi cho đối tác.
 */
function rollupDedupeKey(day: string): string {
  return `unique:ROLLUP-FACEIDCOUNT-${day}`;
}

/** So sánh token theo thời gian hằng để không rò độ dài/khớp qua timing. */
function tokenMatches(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Ngày hiện tại theo giờ Việt Nam — mốc gom lượt của một ngày. */
function vietnamTodayKey(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function vietnamTimeText(at: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(at);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
}

/**
 * Gom In/Out của HeadCount trong ngày thành số lượt, rồi đẩy sang hệ thống khác
 * dưới dạng payload FaceIdCount. Cron trên server gọi mỗi 15 phút qua loopback.
 *
 * Con số gửi đi là LŨY KẾ từ đầu ngày chứ không phải lượt trong 15 phút vừa
 * qua: bên nhận gom theo (ngày, camera, khung giờ) rồi lấy `$max`, nên gửi số
 * lẻ từng nhịp sẽ khiến tổng ngày tụt về đúng nhịp lớn nhất.
 *
 * Hai công tắc TÁCH RỜI nhau:
 * - HEADCOUNT_FORWARD_TOKEN: thiếu thì endpoint coi như tắt hẳn (404).
 * - HEADCOUNT_FORWARD_URL: thiếu thì vẫn tính và cộng vào DB cho dashboard,
 *   chỉ bỏ bước gửi ra ngoài. Đây là cách tạm dừng đối tác mà số liệu trên
 *   trang mình vẫn chạy tiếp.
 *
 * Nằm ngoài cookie-auth (xem auth-guard) nên tự gác bằng token chia sẻ:
 * env HEADCOUNT_FORWARD_TOKEN phải khớp header x-sync-token.
 */
export async function POST(request: NextRequest) {
  const expected = process.env.HEADCOUNT_FORWARD_TOKEN;
  const forwardUrl = process.env.HEADCOUNT_FORWARD_URL;
  if (!expected) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
  if (!tokenMatches(request.headers.get("x-sync-token"), expected)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const day = vietnamTodayKey();
  await connectMongo();

  // Gom In/Out theo từng camera trong ngày hôm nay. Ngày lấy từ `timestamp`
  // (µs UTC, khớp đồng hồ server) chứ không từ chuỗi `Time` của box.
  const tallies = await AlarmModel.aggregate<CameraTally>([
    { $match: { summary: HEADCOUNT_SUMMARY } },
    {
      $project: {
        camera: { $ifNull: ["$mediaName", "(không rõ camera)"] },
        description: 1,
        day: {
          $dateToString: {
            format: "%Y-%m-%d",
            timezone: "Asia/Ho_Chi_Minh",
            date: {
              $cond: [
                { $gt: [{ $ifNull: ["$timestamp", 0] }, 0] },
                { $toDate: { $divide: ["$timestamp", 1000] } },
                "$time"
              ]
            }
          }
        }
      }
    },
    { $match: { day } },
    {
      $group: {
        _id: "$camera",
        in: { $sum: { $cond: [{ $eq: ["$description", "In"] }, 1, 0] } },
        out: { $sum: { $cond: [{ $eq: ["$description", "Out"] }, 1, 0] } }
      }
    },
    { $project: { _id: 0, camera: "$_id", in: 1, out: 1 } }
  ]);

  const realPairs = countVisitPairs(tallies);

  // Nền seed của ngày: các nhịp seed mang số LŨY KẾ nên nhịp cuối là tổng ngày.
  const seeded = await AlarmModel.findOne(
    {
      summary: FACEIDCOUNT_SUMMARY,
      dedupeKey: { $regex: `^${SEEDED_FACEIDCOUNT_PREFIX}${day}` }
    },
    { raw: 1, mediaName: 1 }
  )
    .sort({ timestamp: -1 })
    .lean<{ raw?: Record<string, unknown>; mediaName?: string } | null>();

  const seededWindow = (
    seeded?.raw as
      | { Result?: { Properties?: { property?: string; value?: unknown }[] } }
      | undefined
  )?.Result?.Properties?.find((property) => property.property === "FaceIdCount")
    ?.value as { Start: number; End: number; Count: number }[] | undefined;

  const seededCount = seededWindow?.[0]?.Count ?? 0;
  const window = seededWindow?.[0]
    ? { Start: seededWindow[0].Start, End: seededWindow[0].End }
    : undefined;
  const count = seededCount + realPairs;

  // Lấy một sự kiện HeadCount thật của chính box làm khuôn, để payload gửi đi
  // giữ nguyên mọi trường bao ngoài mà box vẫn gửi.
  const template = await AlarmModel.findOne({ summary: HEADCOUNT_SUMMARY }, { raw: 1 })
    .sort({ timestamp: -1 })
    .lean<{ raw?: Record<string, unknown> } | null>();

  if (!template?.raw) {
    return NextResponse.json(
      { ok: false, error: "Chưa có sự kiện HeadCount nào để lấy làm khuôn payload" },
      { status: 409 }
    );
  }

  const now = new Date();
  const timeText = vietnamTimeText(now);
  const timestamp = now.getTime() * 1000;
  const payload = buildFaceIdCountPayload(template.raw, {
    count,
    timeText,
    timestamp,
    alarmId: randomUUID().toUpperCase(),
    uniqueId: `ALARM_${randomUUID().toUpperCase()}`,
    window
  });

  // Trang Lưu lượng khách đọc bảng riêng (`visitor_daily_counts`) chứ không đọc
  // FaceIdCount, nên phải ghi thêm ở đây — nếu không, hai màn hình sẽ lệch nhau.
  await VisitorDailyCountModel.updateOne(
    { _id: day },
    { $set: { unique_count: count, updated_at: now } },
    { upsert: true }
  );

  // Ghi lại chính con số vừa gửi vào DB, cùng camera + khung giờ với nhịp seed,
  // để Tổng quan và đối tác luôn khớp nhau. Một dòng cho mỗi ngày, ghi đè tại chỗ.
  if (seeded?.mediaName) {
    await AlarmModel.updateOne(
      { dedupeKey: rollupDedupeKey(day) },
      {
        $set: {
          summary: FACEIDCOUNT_SUMMARY,
          description: "Count By Face Id",
          mediaName: seeded.mediaName,
          time: now,
          timeText,
          timestamp,
          imageKind: "none",
          imageUrl: null,
          imagePath: null,
          raw: payload
        }
      },
      { upsert: true }
    );
  }

  // Số liệu phía trên đã ghi vào DB xong. Không có URL đích nghĩa là đang tạm
  // dừng phía đối tác — dashboard vẫn cập nhật, chỉ không gửi đi.
  if (!forwardUrl) {
    return NextResponse.json({
      ok: true,
      forwarded: false,
      day,
      count,
      seededCount,
      realPairs,
      cameras: tallies
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FORWARD_TIMEOUT_MS);
  try {
    const response = await fetch(forwardUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    return NextResponse.json({
      ok: response.ok,
      forwarded: true,
      day,
      count,
      seededCount,
      realPairs,
      cameras: tallies,
      forwardStatus: response.status
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gửi thất bại";
    return NextResponse.json(
      { ok: false, forwarded: false, day, count, cameras: tallies, error: message },
      { status: 502 }
    );
  } finally {
    clearTimeout(timeout);
  }
}
