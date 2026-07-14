import type { Granularity, VisitorCountsResult } from "@/lib/aibox/visitor-stats";

export type { Granularity, VisitorCountsResult };

export interface VisitorCountsResponse extends VisitorCountsResult {
  ok: boolean;
}

export async function fetchVisitorCounts(params: {
  from: string;
  to: string;
  granularity: Granularity;
}): Promise<VisitorCountsResponse> {
  const query = new URLSearchParams(params);
  const response = await fetch(`/api/visitor-counts?${query.toString()}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load visitor counts: ${response.status}`);
  }
  return (await response.json()) as VisitorCountsResponse;
}
