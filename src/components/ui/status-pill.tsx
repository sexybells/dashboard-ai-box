import { cn } from "@/lib/cn";
import { getRealtimeStatusLabel, type RealtimeStatus } from "@/components/alarm-display";

const STYLES: Record<RealtimeStatus, string> = {
  live: "border-success/30 bg-success/10 text-success",
  connecting: "border-warning/30 bg-warning/10 text-warning",
  offline: "border-destructive/30 bg-destructive/10 text-destructive"
};

export function StatusPill({ status, className }: { status: RealtimeStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold",
        STYLES[status],
        className
      )}
    >
      <span className={cn("size-1.5 rounded-full bg-current", status === "live" && "animate-pulse")} />
      {getRealtimeStatusLabel(status)}
    </span>
  );
}
