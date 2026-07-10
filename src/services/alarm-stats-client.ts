import type { AlarmStats } from "@/lib/aibox/alarm-stats";

export type { AlarmStats };

export async function fetchAlarmStats(days = 30): Promise<AlarmStats> {
  const response = await fetch(`/api/alarms/stats?days=${days}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load stats: ${response.status}`);
  }
  return (await response.json()) as AlarmStats;
}
