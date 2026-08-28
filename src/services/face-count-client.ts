import type {
  DayCameraTotal,
  FaceCountPeriods,
  FaceIdWindow
} from "@/lib/aibox/face-id-count";

export type { DayCameraTotal, FaceCountPeriods, FaceIdWindow };

export interface FaceCountResponse {
  ok: boolean;
  /** The day treated as "today" for the period figures. */
  day: string;
  /** Camera counted for `day` — camera totals are picked, never summed. */
  camera: string | null;
  periods: FaceCountPeriods;
  /** One row per day, after resolving which camera to count. */
  byDay: DayCameraTotal[];
  /** Today's per-camera split, for deciding which camera to pin. */
  camerasToday: { camera: string; total: number }[];
  configuredWindows: FaceIdWindow[];
  updatedAt: string | null;
}

export async function fetchFaceCount(day?: string): Promise<FaceCountResponse> {
  const query = day ? `?day=${encodeURIComponent(day)}` : "";
  const response = await fetch(`/api/face-count${query}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load face count: ${response.status}`);
  }
  return (await response.json()) as FaceCountResponse;
}
