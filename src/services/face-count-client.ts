import type { CameraFaceCount, FaceIdWindow } from "@/lib/aibox/face-id-count";

export type { CameraFaceCount, FaceIdWindow };

export interface FaceCountResponse {
  ok: boolean;
  day: string;
  /** Unique visitors for `day`, taken from a single camera (never a sum). */
  total: number;
  camera: string | null;
  windows: FaceIdWindow[];
  /** Every camera's own total, for diagnosing which one to pin. */
  cameras: CameraFaceCount[];
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
