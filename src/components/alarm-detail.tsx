import Image from "next/image";
import { formatUnknown } from "@/components/alarm-display";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface AlarmDetailProps {
  alarm: {
    id: string;
    alarmId?: string;
    uniqueId?: string;
    taskSession?: string;
    taskDesc?: string;
    summary?: string;
    description?: string;
    time?: string;
    timeText?: string;
    boardId?: string;
    boardIp?: string;
    mediaName?: string;
    mediaUrl?: string;
    imageKind?: string;
    imageUrl?: string | null;
    imageOriginal?: string;
    raw?: {
      Result?: {
        Properties?: Array<{
          desc?: string;
          display?: string;
          property?: string;
          type?: string;
          value?: unknown;
        }>;
      };
      [key: string]: unknown;
    };
  };
}

function Row({ label, value }: { label: string; value?: unknown }) {
  return (
    <div className="grid grid-cols-[128px_minmax(0,1fr)] gap-3 border-b border-border pb-2.5 last:border-0 last:pb-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <strong className="break-words text-sm font-medium">
        {typeof value === "string" || typeof value === "number" ? formatUnknown(value) : "-"}
      </strong>
    </div>
  );
}

export function AlarmDetail({ alarm }: AlarmDetailProps) {
  const properties = alarm.raw?.Result?.Properties || [];

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.8fr)]">
      <Card>
        <CardHeader>
          <CardTitle>Ảnh cảnh báo</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid min-h-[420px] place-items-center overflow-auto rounded-lg border border-dashed border-border bg-muted">
            {alarm.imageUrl ? (
              <Image
                src={alarm.imageUrl}
                alt={alarm.summary || "Cảnh báo AI Box"}
                width={1000}
                height={640}
                unoptimized
                className="h-auto max-h-[70vh] w-full object-contain"
              />
            ) : (
              <div className="px-6 py-10 text-center text-sm text-muted-foreground">
                Không có ảnh cục bộ. Nguồn: {alarm.imageOriginal || alarm.imageKind || "không có"}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Thông tin cảnh báo</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2.5">
          <Row label="Tác vụ" value={alarm.taskSession} />
          <Row label="Tóm tắt" value={alarm.summary} />
          <Row label="Mô tả" value={alarm.description} />
          <Row label="Camera" value={alarm.mediaName} />
          <Row label="IP thiết bị" value={alarm.boardIp} />
          <Row label="Mã cảnh báo" value={alarm.alarmId} />
          <Row label="Mã định danh" value={alarm.uniqueId} />
          <Row label="Thời gian" value={alarm.timeText || alarm.time} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Thuộc tính kết quả</CardTitle>
          <span className="text-xs text-muted-foreground">{properties.length.toLocaleString("vi-VN")} mục</span>
        </CardHeader>
        <CardContent>
          {properties.length > 0 ? (
            <div className="grid gap-2.5">
              {properties.map((property, index) => (
                <div
                  key={`${property.property || property.desc}-${index}`}
                  className="grid grid-cols-[128px_minmax(0,1fr)] gap-3 border-b border-border pb-2.5 last:border-0 last:pb-0"
                >
                  <span className="text-sm text-muted-foreground">{property.desc || property.property || "Thuộc tính"}</span>
                  <strong className="break-words text-sm font-medium">
                    {property.display || String(property.value ?? "-")}
                  </strong>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-sm text-muted-foreground">Payload không có Result.Properties.</div>
          )}
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Dữ liệu gốc JSON</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="max-h-[560px] overflow-auto rounded-lg bg-neutral-900 p-4 text-xs leading-relaxed text-neutral-100">
            {JSON.stringify(alarm.raw || alarm, null, 2)}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
