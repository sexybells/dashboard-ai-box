// Bộ não thuần của tính năng tua lại (không I/O, unit-test được):
// biến kết quả /list của MediaMTX thành timeline vẽ được, và đổi mốc thời gian
// người dùng chọn thành cửa sổ {start, duration} để gọi /get.
//
// /list trả [{ start: RFC3339, duration: giây }] — mỗi phần tử là một khoảng
// đã ghi. Các segment liền kề có thể hở nhau vài trăm ms (cắt file), nên khi
// dựng timeline ta hàn các khoảng gần nhau lại để thanh tua liền mạch và
// playback không bị cắt vụn theo từng segment.

export interface RecordingRangeInput {
  /** RFC3339, vd "2026-08-11T17:11:35.212639+07:00". */
  start: string;
  /** Độ dài giây (số thực). */
  duration: number;
}

export interface RecordingRange {
  start: Date;
  end: Date;
  durationSec: number;
}

export interface PlaybackWindow {
  start: Date;
  durationSec: number;
}

/** Khoảng hở giữa 2 segment <= ngưỡng này thì coi là liền mạch. */
export const MERGE_TOLERANCE_SEC = 2;

/**
 * Parse kết quả /list thành các khoảng đã sắp xếp theo thời gian.
 * Bỏ phần tử hỏng (start không parse được, duration <= 0) thay vì ném lỗi —
 * một segment hỏng không nên làm sập cả timeline.
 */
export function parseRecordingRanges(items: RecordingRangeInput[]): RecordingRange[] {
  const ranges: RecordingRange[] = [];
  for (const item of items) {
    const start = new Date(item.start);
    if (Number.isNaN(start.getTime())) continue;
    if (!Number.isFinite(item.duration) || item.duration <= 0) continue;
    ranges.push({
      start,
      end: new Date(start.getTime() + item.duration * 1000),
      durationSec: item.duration
    });
  }
  ranges.sort((a, b) => a.start.getTime() - b.start.getTime());
  return ranges;
}

/**
 * Hàn các khoảng chồng lấn hoặc hở nhau <= toleranceSec thành một khoảng liên
 * tục. Input phải đã sort theo start (parseRecordingRanges đảm bảo).
 */
export function mergeRanges(
  ranges: RecordingRange[],
  toleranceSec: number = MERGE_TOLERANCE_SEC
): RecordingRange[] {
  const merged: RecordingRange[] = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range.start.getTime() - last.end.getTime() <= toleranceSec * 1000) {
      if (range.end.getTime() > last.end.getTime()) {
        last.end = range.end;
        last.durationSec = (last.end.getTime() - last.start.getTime()) / 1000;
      }
      continue;
    }
    // Copy để không mutate input khi kéo dài khoảng.
    merged.push({ ...range });
  }
  return merged;
}

/** Tìm khoảng (đã hàn) chứa mốc thời gian t, nếu có. */
export function findRangeAt(ranges: RecordingRange[], t: Date): RecordingRange | undefined {
  const ms = t.getTime();
  return ranges.find((r) => r.start.getTime() <= ms && ms < r.end.getTime());
}

/**
 * Đổi mốc thời gian người dùng chọn thành cửa sổ phát cho /get:
 * - Rơi trúng khoảng đã ghi → phát từ đúng mốc đó tới hết khoảng liên tục.
 * - Rơi vào chỗ hở / trước khoảng đầu → nhảy tới đầu khoảng kế tiếp.
 * - Sau khoảng cuối → null (chưa có ghi hình tại đó, UI báo).
 * Cửa sổ luôn kết thúc ở cuối khoảng liên tục — qua chỗ hở người dùng bấm
 * tiếp trên timeline (video kết thúc tự nhiên, UI có thể auto-nhảy).
 */
export function resolvePlaybackWindow(ranges: RecordingRange[], target: Date): PlaybackWindow | null {
  const hit = findRangeAt(ranges, target);
  if (hit) {
    return { start: target, durationSec: (hit.end.getTime() - target.getTime()) / 1000 };
  }
  const next = ranges.find((r) => r.start.getTime() > target.getTime());
  if (next) {
    return { start: next.start, durationSec: next.durationSec };
  }
  return null;
}

export interface TimelineSpan {
  /** Vị trí trái, tỉ lệ 0..1 so với cửa sổ nhìn. */
  offsetFrac: number;
  /** Bề rộng, tỉ lệ 0..1 so với cửa sổ nhìn. */
  widthFrac: number;
  range: RecordingRange;
}

/**
 * Chiếu các khoảng đã ghi lên cửa sổ nhìn [viewStart, viewEnd] thành các dải
 * tỉ lệ 0..1 để component vẽ bằng CSS (left/width %). Khoảng ngoài cửa sổ bị
 * loại, khoảng tràn mép bị cắt.
 */
export function computeTimelineSpans(
  ranges: RecordingRange[],
  viewStart: Date,
  viewEnd: Date
): TimelineSpan[] {
  const viewMs = viewEnd.getTime() - viewStart.getTime();
  if (viewMs <= 0) return [];
  const spans: TimelineSpan[] = [];
  for (const range of ranges) {
    const clippedStart = Math.max(range.start.getTime(), viewStart.getTime());
    const clippedEnd = Math.min(range.end.getTime(), viewEnd.getTime());
    if (clippedEnd <= clippedStart) continue;
    spans.push({
      offsetFrac: (clippedStart - viewStart.getTime()) / viewMs,
      widthFrac: (clippedEnd - clippedStart) / viewMs,
      range
    });
  }
  return spans;
}

/** Đổi tỉ lệ 0..1 trên thanh tua thành mốc thời gian trong cửa sổ nhìn. */
export function fracToTime(frac: number, viewStart: Date, viewEnd: Date): Date {
  const clamped = Math.min(1, Math.max(0, frac));
  return new Date(viewStart.getTime() + clamped * (viewEnd.getTime() - viewStart.getTime()));
}
