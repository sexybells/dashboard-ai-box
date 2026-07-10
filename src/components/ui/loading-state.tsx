import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

type LoadingStateProps = {
  label?: string;
  description?: string;
  rows?: number;
  className?: string;
};

export function LoadingState({
  label = "Đang tải dữ liệu",
  description = "Vui lòng chờ trong giây lát",
  rows = 3,
  className
}: LoadingStateProps) {
  const skeletonRows = Array.from({ length: Math.max(0, rows) }, (_, index) => index);

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex min-h-[220px] flex-col items-center justify-center gap-5 rounded-xl border border-border bg-card/70 px-5 py-8 text-center",
        className
      )}
    >
      <div className="flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
        <Loader2 className="size-5 animate-spin" aria-hidden="true" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">{label}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {skeletonRows.length > 0 ? (
        <div className="grid w-full max-w-md gap-2" aria-hidden="true">
          {skeletonRows.map((row) => (
            <span
              key={row}
              data-slot="loading-skeleton"
              className={cn(
                "h-2.5 animate-pulse rounded-full bg-muted",
                row % 3 === 0 ? "w-full" : row % 3 === 1 ? "w-4/5 justify-self-center" : "w-2/3 justify-self-center"
              )}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
