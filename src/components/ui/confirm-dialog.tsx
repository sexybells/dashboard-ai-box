"use client";

import { useEffect, useRef } from "react";
import { AlertTriangle } from "lucide-react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isBusy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Xoá",
  cancelLabel = "Huỷ",
  isBusy = false,
  onConfirm,
  onCancel
}: ConfirmDialogProps) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  // Focus the safe action first so Enter never triggers a destructive default.
  useEffect(() => {
    if (open) cancelButtonRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isBusy) onCancel();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isBusy, onCancel, open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
      onClick={() => {
        if (!isBusy) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="w-full max-w-md rounded-xl border border-border bg-card p-5 text-card-foreground shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangle className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 id="confirm-dialog-title" className="text-base font-semibold tracking-tight">
              {title}
            </h2>
            <p className="mt-1 break-words text-sm text-muted-foreground">{description}</p>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2.5">
          <button
            ref={cancelButtonRef}
            type="button"
            onClick={onCancel}
            disabled={isBusy}
            className="inline-flex h-10 items-center rounded-md border border-border bg-card px-4 text-sm font-medium hover:bg-accent hover:text-accent-foreground disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isBusy}
            className="inline-flex h-10 items-center rounded-md bg-destructive px-4 text-sm font-semibold text-destructive-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {isBusy ? "Đang xoá..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
