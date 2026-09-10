import type { FootfallResult, Granularity } from "@/lib/aibox/footfall-stats";

export type { Granularity, FootfallResult };

export interface FootfallResponse extends FootfallResult {
  ok: boolean;
}

export async function fetchFootfall(params: {
  from: string;
  to: string;
  granularity: Granularity;
  day?: string;
}): Promise<FootfallResponse> {
  const query = new URLSearchParams({
    from: params.from,
    to: params.to,
    granularity: params.granularity
  });
  if (params.day) query.set("day", params.day);
  const response = await fetch(`/api/footfall?${query.toString()}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load footfall: ${response.status}`);
  }
  return (await response.json()) as FootfallResponse;
}
