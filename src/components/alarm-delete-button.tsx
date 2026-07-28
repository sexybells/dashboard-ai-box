"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { deleteAlarms } from "@/services/alarm-client";

interface AlarmDeleteButtonProps {
  alarmId: string;
  alarmLabel: string;
}

export function AlarmDeleteButton({ alarmId, alarmLabel }: AlarmDeleteButtonProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setIsDeleting(true);
    try {
      await deleteAlarms([alarmId]);
      setIsOpen(false);
      router.push("/alarms");
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Xoá cảnh báo thất bại");
      setIsOpen(false);
      setIsDeleting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setIsOpen(true);
        }}
        disabled={isDeleting}
        className="inline-flex h-10 items-center gap-2 rounded-md border border-destructive/40 bg-card px-4 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-60"
      >
        <Trash2 className="size-4" />
        Xoá cảnh báo
      </button>

      {error ? (
        <p className="w-full text-right text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <ConfirmDialog
        open={isOpen}
        title="Xoá cảnh báo?"
        description={`Cảnh báo "${alarmLabel}" sẽ bị xoá vĩnh viễn. Hành động này không thể hoàn tác.`}
        isBusy={isDeleting}
        onConfirm={() => void handleConfirm()}
        onCancel={() => setIsOpen(false)}
      />
    </>
  );
}
