"use client";

import { useEffect, useState } from "react";
import type { RealtimeStatus } from "@/components/alarm-display";

/** Lightweight realtime-connection status via the SSE stream (status only). */
export function useRealtimeStatus(): RealtimeStatus {
  const [status, setStatus] = useState<RealtimeStatus>("connecting");

  useEffect(() => {
    const source = new EventSource("/api/alarms/stream");
    const markLive = () => setStatus("live");
    source.addEventListener("ready", markLive);
    source.addEventListener("alarm-created", markLive);
    source.onerror = () => setStatus("offline");
    return () => source.close();
  }, []);

  return status;
}
