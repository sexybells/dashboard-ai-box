// Detection rectangles carried in an AI Box alarm payload (the `raw` field).
// Coordinates arrive normalized (0–1) against the source frame, so callers can
// render them as percentages: the box downscales the frame (1920x1080 → 640x360)
// without cropping, which keeps normalized coordinates valid at any image size.

export interface DetectionBox {
  /** Normalized 0–1 from the top-left corner of the frame. */
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
}

type AnyRecord = Record<string, unknown>;

function asRecord(value: unknown): AnyRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as AnyRecord) : {};
}

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Clamp to the frame; drop the box when clamping leaves it with no area. */
function toBox(x: number, y: number, width: number, height: number, label?: string): DetectionBox | null {
  const left = clamp01(x);
  const top = clamp01(y);
  const right = clamp01(x + width);
  const bottom = clamp01(y + height);
  if (right <= left || bottom <= top) return null;
  return { x: left, y: top, width: right - left, height: bottom - top, label };
}

/** `Result.RelativeBox` is a flat [x, y, width, height] tuple. */
function fromRelativeBox(value: unknown, label?: string): DetectionBox | null {
  if (!Array.isArray(value) || value.length < 4) return null;
  const [x, y, width, height] = value.map(asFiniteNumber);
  if (x === undefined || y === undefined || width === undefined || height === undefined) return null;
  return toBox(x, y, width, height, label);
}

// `Points` holds the two opposite corners of a Rectangle, in no guaranteed order.
// Taking the min/max also yields the bounding box of a polygon RegType.
function fromPoints(value: unknown, label?: string): DetectionBox | null {
  if (!Array.isArray(value)) return null;

  const xs: number[] = [];
  const ys: number[] = [];
  for (const point of value) {
    const record = asRecord(point);
    const x = asFiniteNumber(record.X);
    const y = asFiniteNumber(record.Y);
    if (x === undefined || y === undefined) continue;
    xs.push(x);
    ys.push(y);
  }
  if (xs.length < 2) return null;

  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return toBox(minX, minY, Math.max(...xs) - minX, Math.max(...ys) - minY, label);
}

/** Every rectangle the box reported: the main detection plus each extra object. */
export function extractDetectionBoxes(raw: unknown): DetectionBox[] {
  const payload = asRecord(raw);
  const result = asRecord(payload.Result);
  const boxes: DetectionBox[] = [];

  const main = fromRelativeBox(result.RelativeBox, asString(result.Description) ?? asString(payload.Summary));
  if (main) boxes.push(main);

  const extras = Array.isArray(result.ExtraObjects) ? result.ExtraObjects : [];
  for (const extra of extras) {
    const record = asRecord(extra);
    const box = fromPoints(record.Points, asString(record.Description) ?? asString(record.Summary));
    if (box) boxes.push(box);
  }

  return boxes;
}

/** Source frame ratio, so the rendered image keeps the geometry the boxes assume. */
export function extractFrameAspectRatio(raw: unknown): number | undefined {
  const media = asRecord(asRecord(raw).Media);
  const width = asFiniteNumber(media.MediaWidth);
  const height = asFiniteNumber(media.MediaHeight);
  if (!width || !height || width <= 0 || height <= 0) return undefined;
  return width / height;
}
