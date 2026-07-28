"use client";

import Image from "next/image";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { formatAlarmTime } from "@/components/alarm-display";
import type { AlarmListItem } from "@/services/alarm-client";
import { areAllSelected } from "@/services/alarm-selection";

interface AlarmTableProps {
  alarms: AlarmListItem[];
  highlightedAlarmIds: ReadonlySet<string>;
  selectedAlarmIds: ReadonlySet<string>;
  isDeleting: boolean;
  emptyMessage: string;
  showEmptyState: boolean;
  onToggleAlarm: (id: string) => void;
  onToggleAll: () => void;
  onDeleteAlarm: (alarm: AlarmListItem) => void;
}

const checkboxClass = "size-4 cursor-pointer accent-[var(--brand)] disabled:cursor-not-allowed";

// Row style with a fade highlight for newly-arrived alarms.
function rowClass(highlighted: boolean): string {
  return highlighted
    ? "border-b border-border bg-success/10 transition-colors"
    : "border-b border-border transition-colors hover:bg-muted/40";
}

export function AlarmTable({
  alarms,
  highlightedAlarmIds,
  selectedAlarmIds,
  isDeleting,
  emptyMessage,
  showEmptyState,
  onToggleAlarm,
  onToggleAll,
  onDeleteAlarm
}: AlarmTableProps) {
  const visibleIds = alarms.map((alarm) => alarm.id);
  const allSelected = areAllSelected(selectedAlarmIds, visibleIds);
  const someSelected = !allSelected && visibleIds.some((id) => selectedAlarmIds.has(id));

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[920px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <th className="w-10 px-4 py-3">
              <input
                type="checkbox"
                className={checkboxClass}
                aria-label="Chọn tất cả cảnh báo đang hiển thị"
                checked={allSelected}
                ref={(node) => {
                  if (node) node.indeterminate = someSelected;
                }}
                onChange={onToggleAll}
                disabled={alarms.length === 0 || isDeleting}
              />
            </th>
            <th className="px-4 py-3">Ảnh</th>
            <th className="px-4 py-3">Tác vụ</th>
            <th className="px-4 py-3">Camera</th>
            <th className="px-4 py-3">Cảnh báo</th>
            <th className="px-4 py-3">Thời gian</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {alarms.map((alarm) => (
            <tr key={alarm.id} className={rowClass(highlightedAlarmIds.has(alarm.id))}>
              <td className="px-4 py-3 align-middle">
                <input
                  type="checkbox"
                  className={checkboxClass}
                  aria-label={`Chọn cảnh báo ${alarm.summary || alarm.taskSession || alarm.id}`}
                  checked={selectedAlarmIds.has(alarm.id)}
                  onChange={() => onToggleAlarm(alarm.id)}
                  disabled={isDeleting}
                />
              </td>
              <td className="px-4 py-3 align-middle">
                <div className="flex size-16 items-center justify-center overflow-hidden rounded-md border border-border bg-muted text-[11px] text-muted-foreground">
                  {alarm.imageUrl ? (
                    <Image
                      src={alarm.imageUrl}
                      alt={alarm.summary || "Cảnh báo AI Box"}
                      width={96}
                      height={64}
                      unoptimized
                      className="size-full object-cover"
                    />
                  ) : (
                    <span>{alarm.imageKind}</span>
                  )}
                </div>
              </td>
              <td className="px-4 py-3 align-middle">
                <span className="block font-medium break-words">{alarm.taskSession || "-"}</span>
                <span className="mt-0.5 block max-w-[280px] truncate text-xs text-muted-foreground">
                  {alarm.taskDesc || alarm.boardIp || ""}
                </span>
              </td>
              <td className="px-4 py-3 align-middle">
                <span className="block font-medium break-words">{alarm.mediaName || "-"}</span>
                <span className="mt-0.5 block max-w-[280px] truncate text-xs text-muted-foreground">
                  {alarm.mediaUrl || ""}
                </span>
              </td>
              <td className="px-4 py-3 align-middle">
                <span className="block font-medium break-words">{alarm.summary || "-"}</span>
                <span className="mt-0.5 block max-w-[280px] truncate text-xs text-muted-foreground">
                  {alarm.description || ""}
                </span>
              </td>
              <td className="px-4 py-3 align-middle whitespace-nowrap">
                {formatAlarmTime(alarm.time, alarm.timeText)}
              </td>
              <td className="px-4 py-3 align-middle">
                <div className="flex items-center justify-end gap-3 whitespace-nowrap">
                  <Link className="font-medium text-brand hover:underline" href={`/alarms/${alarm.id}`}>
                    Chi tiết
                  </Link>
                  <button
                    type="button"
                    onClick={() => onDeleteAlarm(alarm)}
                    disabled={isDeleting}
                    aria-label={`Xoá cảnh báo ${alarm.summary || alarm.taskSession || alarm.id}`}
                    title="Xoá cảnh báo"
                    className="inline-flex size-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive disabled:opacity-60"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {showEmptyState ? (
            <tr>
              <td colSpan={7}>
                <div className="px-6 py-10 text-center text-sm text-muted-foreground">{emptyMessage}</div>
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
