"use client";

import { Maximize2, Pencil, Plus, Trash2, VideoOff } from "lucide-react";
import { useState } from "react";
import { EzvizPlayer } from "@/components/camera/ezviz-player";
import { HlsPlayer } from "@/components/camera/hls-player";
import { useLiveUrls } from "@/components/camera/use-live-urls";
import { cn } from "@/lib/cn";
import { deleteCamera, type CameraListItem } from "@/services/camera-client";

// Tường camera kiểu NVR + CRUD: camera thật phát live trong ô của nó (nút sửa
// / xoá hiện khi hover), ô trống đầu tiên là nút "Thêm camera", ô trống còn
// lại để chờ. URL + creds đọc luồng lấy từ /api/cameras/[code]/live.

interface CameraGridProps {
  cameras: CameraListItem[];
  onSelect: (code: string) => void;
  onAdd: () => void;
  onEdit: (camera: CameraListItem) => void;
  onChanged: () => void;
}

/**
 * Phần video của camera RTSP. Tách riêng vì useLiveUrls chỉ có nghĩa với
 * camera đi qua MediaMTX — hook không được gọi có điều kiện, nên camera EZVIZ
 * phải nằm ở nhánh component khác chứ không phải nhánh `if` trong cùng hàm.
 */
function RtspTileVideo({ cam }: { cam: CameraListItem }) {
  const { live, error } = useLiveUrls(cam.code);

  if (!cam.online) {
    return (
      <div className="flex size-full flex-col items-center justify-center gap-2">
        <VideoOff className="size-6 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">Camera mất kết nối</p>
      </div>
    );
  }
  if (live) {
    return <HlsPlayer src={live.hls} auth={live.auth} className="size-full" />;
  }
  return (
    <div className="flex size-full items-center justify-center">
      <p className="text-xs text-muted-foreground">
        {error ? "Không tải được cấu hình luồng" : "Đang tải…"}
      </p>
    </div>
  );
}

function GridTile({
  cam,
  onSelect,
  onEdit,
  onChanged
}: {
  cam: CameraListItem;
  onSelect: (code: string) => void;
  onEdit: (camera: CameraListItem) => void;
  onChanged: () => void;
}) {
  const [deleting, setDeleting] = useState(false);

  const remove = async () => {
    if (!window.confirm(`Xoá camera "${cam.name}"? Ghi hình cũ vẫn xem lại được tới khi hết hạn lưu.`)) {
      return;
    }
    setDeleting(true);
    try {
      await deleteCamera(cam.code);
      onChanged();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Không xoá được camera");
      setDeleting(false);
    }
  };

  return (
    <div className="group relative overflow-hidden rounded-xl border border-border bg-black">
      {/*
        Camera RTSP: cả khung là nút mở toàn màn hình (video chỉ là ảnh động,
        không nhận click). Camera EZVIZ: player của EZUIKit có nút bấm và hộp
        thoại riêng — bọc trong <button> là nút lồng nút, HTML sai và click bị
        nuốt. Nên EZVIZ mở toàn khung bằng nút phóng to ở thanh hover.
      */}
      {cam.source === "ezviz" ? (
        <div className="aspect-video">
          <EzvizPlayer code={cam.code} kind="live" onVerifyCodeSaved={onChanged} />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => onSelect(cam.code)}
          className="block w-full text-left transition hover:opacity-95"
        >
          <div className="aspect-video">
            <RtspTileVideo cam={cam} />
          </div>
        </button>
      )}

      {/* Nút mở rộng / sửa / xoá — hiện khi hover, nổi góc trên phải. */}
      <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition group-hover:opacity-100">
        {cam.source === "ezviz" ? (
          // Camera EZVIZ được quản lý ở tài khoản EZVIZ: sửa tên hay xoá ở đây
          // sẽ bị lần đồng bộ kế tiếp ghi đè / tạo lại, nên chỉ cho xem.
          <button
            type="button"
            onClick={() => onSelect(cam.code)}
            title="Xem toàn khung"
            className="rounded-md bg-black/60 p-1.5 text-white transition hover:bg-black/80"
          >
            <Maximize2 className="size-3.5" />
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => onEdit(cam)}
              title="Sửa"
              className="rounded-md bg-black/60 p-1.5 text-white transition hover:bg-black/80"
            >
              <Pencil className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => void remove()}
              disabled={deleting}
              title="Xoá"
              className="rounded-md bg-black/60 p-1.5 text-white transition hover:bg-destructive disabled:opacity-50"
            >
              <Trash2 className="size-3.5" />
            </button>
          </>
        )}
      </div>

      {/* Dải tên + trạng thái (không chặn click mở toàn khung). */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black/80 to-transparent px-3 pb-2 pt-6">
        <span className={cn("size-2 rounded-full", cam.online ? "bg-emerald-500" : "bg-destructive")} />
        <span className="text-sm font-medium text-white">{cam.name}</span>
        {cam.location ? <span className="text-xs text-white/70">{cam.location}</span> : null}
      </div>
    </div>
  );
}

export function CameraGrid({ cameras, onSelect, onAdd, onEdit, onChanged }: CameraGridProps) {
  // Luôn có ít nhất 1 ô "Thêm camera": ô đầu tiên trống là nút thêm, phần còn
  // lại của hàng để trống chờ. Lưới tối thiểu 2x2 cho ra dáng NVR.
  const cols = cameras.length + 1 <= 4 ? 2 : 3;
  const cellCount = Math.max(4, Math.ceil((cameras.length + 1) / cols) * cols);
  const emptyCount = cellCount - cameras.length;

  return (
    <div className={cn("grid gap-3 sm:gap-4", cols === 2 ? "grid-cols-2" : "grid-cols-2 xl:grid-cols-3")}>
      {cameras.map((cam) => (
        <GridTile key={cam.code} cam={cam} onSelect={onSelect} onEdit={onEdit} onChanged={onChanged} />
      ))}

      {/* Ô trống đầu tiên = nút thêm; các ô sau chỉ là chỗ trống. */}
      {Array.from({ length: emptyCount }, (_, i) =>
        i === 0 ? (
          <button
            key="add"
            type="button"
            onClick={onAdd}
            className="flex aspect-video flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/20 text-muted-foreground transition hover:border-primary/60 hover:text-foreground"
          >
            <Plus className="size-6" />
            <span className="text-sm font-medium">Thêm camera</span>
          </button>
        ) : (
          <div
            key={`empty-${i}`}
            className="flex aspect-video flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border/70 bg-muted/20"
          >
            <VideoOff className="size-5 text-muted-foreground/50" />
            <p className="text-xs text-muted-foreground/60">Trống</p>
          </div>
        )
      )}
    </div>
  );
}
