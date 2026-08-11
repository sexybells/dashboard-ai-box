"use client";

import { useEffect, useState } from "react";
import { fetchCameraLiveUrls, type CameraLiveUrls } from "@/services/camera-client";

// Hook lấy URL live + creds đọc luồng từ /api/cameras/[code]/live. Dùng chung
// cho tile lưới và xem 1 cam — URL không còn dựng phía client vì creds chỉ
// được phát qua endpoint đã cookie-auth (xem live/route.ts).

export function useLiveUrls(code: string): { live: CameraLiveUrls | null; error: boolean } {
  const [live, setLive] = useState<CameraLiveUrls | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    // IIFE: không setState đồng bộ ngay trong thân effect (mẫu footfall-view).
    void (async () => {
      setLive(null);
      setError(false);
      try {
        const urls = await fetchCameraLiveUrls(code);
        if (active) setLive(urls);
      } catch {
        if (active) setError(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [code]);

  return { live, error };
}
