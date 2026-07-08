import Image from "next/image";

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
      <strong>{typeof value === "string" || typeof value === "number" ? value : "-"}</strong>
    </div>
  );
}

export function AlarmDetail({ alarm }: AlarmDetailProps) {
  const properties = alarm.raw?.Result?.Properties || [];

  return (
    <div className="detail-grid">
      <section className="panel media-panel">
        <div className="image-preview">
          {alarm.imageUrl ? (
            <Image
              src={alarm.imageUrl}
              alt={alarm.summary || "AI Box alarm"}
              width={1000}
              height={640}
              unoptimized
            />
          ) : (
            <div className="empty-state">
              No local image. Source: {alarm.imageOriginal || alarm.imageKind || "none"}
            </div>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <h2>Metadata</h2>
        </div>
        <div className="detail-list">
          {row("Task", alarm.taskSession)}
          {row("Summary", alarm.summary)}
          {row("Description", alarm.description)}
          {row("Camera", alarm.mediaName)}
          {row("Board IP", alarm.boardIp)}
          {row("Alarm ID", alarm.alarmId)}
          {row("Unique ID", alarm.uniqueId)}
          {row("Time", alarm.timeText || alarm.time)}
        </div>
      </section>

      <section className="panel properties-panel">
        <div className="section-heading">
          <h2>Result properties</h2>
          <span>{properties.length} items</span>
        </div>
        {properties.length > 0 ? (
          <div className="property-list">
            {properties.map((property, index) => (
              <div className="property-item" key={`${property.property || property.desc}-${index}`}>
                <span>{property.desc || property.property || "Property"}</span>
                <strong>{property.display || String(property.value ?? "-")}</strong>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">No Result.Properties in payload.</div>
        )}
      </section>

      <section className="panel raw-panel">
        <div className="section-heading">
          <h2>Raw JSON</h2>
        </div>
        <pre>{JSON.stringify(alarm.raw || alarm, null, 2)}</pre>
      </section>
    </div>
  );
}
