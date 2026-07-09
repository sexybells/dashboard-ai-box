import Image from "next/image";
import { formatUnknown } from "@/components/alarm-display";

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

function row(label: string, value?: unknown) {
  return (
    <div className="detail-row">
      <span>{label}</span>
      <strong>{typeof value === "string" || typeof value === "number" ? formatUnknown(value) : "-"}</strong>
    </div>
  );
}

export function AlarmDetail({ alarm }: AlarmDetailProps) {
  const properties = alarm.raw?.Result?.Properties || [];

  return (
    <div className="detail-grid">
      <section className="panel media-panel">
        <div className="section-heading">
          <h2>Ảnh cảnh báo</h2>
        </div>
        <div className="image-preview">
          {alarm.imageUrl ? (
            <Image
              src={alarm.imageUrl}
              alt={alarm.summary || "Cảnh báo AI Box"}
              width={1000}
              height={640}
              unoptimized
            />
          ) : (
            <div className="empty-state">
              Không có ảnh cục bộ. Nguồn: {alarm.imageOriginal || alarm.imageKind || "không có"}
            </div>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <h2>Thông tin cảnh báo</h2>
        </div>
        <div className="detail-list">
          {row("Tác vụ", alarm.taskSession)}
          {row("Tóm tắt", alarm.summary)}
          {row("Mô tả", alarm.description)}
          {row("Camera", alarm.mediaName)}
          {row("IP thiết bị", alarm.boardIp)}
          {row("Mã cảnh báo", alarm.alarmId)}
          {row("Mã định danh", alarm.uniqueId)}
          {row("Thời gian", alarm.timeText || alarm.time)}
        </div>
      </section>

      <section className="panel properties-panel">
        <div className="section-heading">
          <h2>Thuộc tính kết quả</h2>
          <span>{properties.length.toLocaleString("vi-VN")} mục</span>
        </div>
        {properties.length > 0 ? (
          <div className="property-list">
            {properties.map((property, index) => (
              <div className="property-item" key={`${property.property || property.desc}-${index}`}>
                <span>{property.desc || property.property || "Thuộc tính"}</span>
                <strong>{property.display || String(property.value ?? "-")}</strong>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">Payload không có Result.Properties.</div>
        )}
      </section>

      <section className="panel raw-panel">
        <div className="section-heading">
          <h2>Dữ liệu gốc JSON</h2>
        </div>
        <pre>{JSON.stringify(alarm.raw || alarm, null, 2)}</pre>
      </section>
    </div>
  );
}
