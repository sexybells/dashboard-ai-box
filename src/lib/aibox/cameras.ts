// Danh sách camera cố định (quản lý bằng config, không CRUD từ UI — xem spec
// 2026-08-11-camera-management-playback). `code` PHẢI trùng tên path trong
// mediamtx.yml; đây cũng là allowlist chặn proxy tới path tuỳ ý trên MediaMTX.

export interface CameraConfig {
  /** Trùng tên path MediaMTX, vd "cam01". Chỉ [a-z0-9_-]. */
  code: string;
  /** Tên hiển thị tiếng Việt trên dashboard. */
  name: string;
  /** Vị trí lắp đặt (tuỳ chọn, hiện dưới tên). */
  location?: string;
}

export const CAMERAS: CameraConfig[] = [
  { code: "cam01", name: "Camera cổng chính", location: "" }
];

/** Tra camera theo code; undefined nếu không nằm trong danh sách. */
export function getCamera(code: string): CameraConfig | undefined {
  return CAMERAS.find((c) => c.code === code);
}

/** Code hợp lệ khi nằm trong CAMERAS — dùng làm allowlist ở API route. */
export function isKnownCameraCode(code: string): boolean {
  return getCamera(code) !== undefined;
}
