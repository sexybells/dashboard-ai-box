"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { getPageSlots, PAGE_GAP } from "@/lib/pagination";

interface PaginationProps {
  page: number;
  totalPages: number;
  disabled?: boolean;
  onPageChange: (page: number) => void;
}

const buttonClass =
  "inline-flex h-9 min-w-9 items-center justify-center gap-1 rounded-md border border-border bg-card px-2.5 text-sm font-medium hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50";

export function Pagination({ page, totalPages, disabled = false, onPageChange }: PaginationProps) {
  if (totalPages < 2) return null;

  const slots = getPageSlots(page, totalPages);

  return (
    <nav aria-label="Phân trang cảnh báo" className="flex flex-wrap items-center justify-center gap-1.5">
      <button
        type="button"
        className={buttonClass}
        onClick={() => onPageChange(page - 1)}
        disabled={disabled || page <= 1}
        aria-label="Trang trước"
      >
        <ChevronLeft className="size-4" />
        <span className="hidden sm:inline">Trước</span>
      </button>

      {slots.map((slot, index) =>
        slot === PAGE_GAP ? (
          <span key={`gap-${index}`} className="px-1 text-sm text-muted-foreground" aria-hidden="true">
            …
          </span>
        ) : (
          <button
            key={slot}
            type="button"
            className={cn(
              buttonClass,
              slot === page && "border-transparent bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
            )}
            onClick={() => onPageChange(slot)}
            disabled={disabled}
            aria-label={`Trang ${slot}`}
            aria-current={slot === page ? "page" : undefined}
          >
            {slot.toLocaleString("vi-VN")}
          </button>
        )
      )}

      <button
        type="button"
        className={buttonClass}
        onClick={() => onPageChange(page + 1)}
        disabled={disabled || page >= totalPages}
        aria-label="Trang sau"
      >
        <span className="hidden sm:inline">Sau</span>
        <ChevronRight className="size-4" />
      </button>
    </nav>
  );
}
