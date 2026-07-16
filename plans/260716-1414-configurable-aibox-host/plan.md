# Configurable AI Box Host Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho phép đổi host AI Box từ trang Cài đặt lúc chạy (thay vì hardcode `192.168.1.26` build-time), và click khung video ở trang Camera để mở host đó ở tab mới.

**Architecture:** Host lưu trong MongoDB (collection `settings`, doc `key="boxHost"`), đọc/ghi qua `GET/PUT /api/settings/box-host`. Trang Camera fetch host lúc mount rồi mới dựng player WebRTC → đổi host ở Cài đặt, mở Camera là áp dụng ngay, không cần build/deploy lại. Logic chuẩn hoá host tách thành hàm thuần để unit-test.

**Tech Stack:** Next.js 16 (App Router), React 19, Mongoose 9, zod 4, vitest 4, Tailwind 4.

**Spec:** [docs/superpowers/specs/2026-07-15-configurable-aibox-host-design.md](../../docs/superpowers/specs/2026-07-15-configurable-aibox-host-design.md)

## Global Constraints

- Ngôn ngữ UI: **tiếng Việt** (khớp toàn bộ app).
- API trả `{ ok: true, ... }` khi thành công; `{ ok: false, error }` + status khi lỗi (theo `src/app/api/auth/login/handler.ts`).
- Validate body bằng **zod** `safeParse` (theo login handler).
- Xác thực `/api/*` đã xử lý tập trung ở `src/proxy.ts` → **không** thêm guard trong route.
- Model export theo pattern: `mongoose.models.X || mongoose.model(...)`.
- Test: vitest, file `*.test.ts` đặt cạnh source, `import { describe, expect, it } from "vitest"`.
- Token màu lỗi: `text-destructive`. Token khác đang dùng: `border-border`, `bg-card`, `bg-brand`, `text-muted-foreground`.
- **Không** đụng: footfall, face-dedup, trang khác.

**Sai lệch có chủ đích so với spec (mục 4.2):** spec ghi `DEFAULT_BOX_HOST` là const đọc `process.env` ở module scope. Thay bằng `FALLBACK_BOX_HOST` (literal) + `resolveDefaultBoxHost(env)` (hàm thuần nhận env). Lý do: `box-settings.ts` được import cả từ client component; đọc `process.env.AIBOX_HOST` (không phải `NEXT_PUBLIC_`) ở module scope không có giá trị trên client và làm hàm mất tính thuần/không test được — spec mục 4.2 yêu cầu hàm thuần, không I/O.

---

### Task 1: Helper chuẩn hoá host (thuần, có test)

**Files:**
- Create: `src/lib/aibox/box-settings.ts`
- Test: `src/lib/aibox/box-settings.test.ts`

**Interfaces:**
- Consumes: (không)
- Produces:
  - `SETTING_KEY_BOX_HOST: "boxHost"`
  - `FALLBACK_BOX_HOST: "http://192.168.1.26"`
  - `normalizeBoxHost(input: string): string | null`
  - `resolveDefaultBoxHost(env: { AIBOX_HOST?: string; NEXT_PUBLIC_AIBOX_HOST?: string }): string`

- [x] **Step 1: Write the failing test**

Create `src/lib/aibox/box-settings.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { FALLBACK_BOX_HOST, normalizeBoxHost, resolveDefaultBoxHost } from "./box-settings";

describe("normalizeBoxHost", () => {
  it("assumes http for a bare host", () => {
    expect(normalizeBoxHost("192.168.1.26")).toBe("http://192.168.1.26");
  });

  it("keeps a valid scheme", () => {
    expect(normalizeBoxHost("https://box.local")).toBe("https://box.local");
  });

  it("keeps host:port, assuming http", () => {
    expect(normalizeBoxHost("192.168.1.26:8080")).toBe("http://192.168.1.26:8080");
    expect(normalizeBoxHost("box.local:8080")).toBe("http://box.local:8080");
  });

  it("strips trailing slash and path noise", () => {
    expect(normalizeBoxHost("http://192.168.1.26/")).toBe("http://192.168.1.26");
    expect(normalizeBoxHost("http://192.168.1.26/#/preview/video")).toBe("http://192.168.1.26");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeBoxHost("  192.168.1.26  ")).toBe("http://192.168.1.26");
  });

  it("rejects empty input", () => {
    expect(normalizeBoxHost("")).toBeNull();
    expect(normalizeBoxHost("   ")).toBeNull();
  });

  it("rejects non-http schemes", () => {
    expect(normalizeBoxHost("ftp://192.168.1.26")).toBeNull();
    expect(normalizeBoxHost("javascript:alert(1)")).toBeNull();
    expect(normalizeBoxHost("javascript://alert")).toBeNull();
  });

  it("rejects unparseable input", () => {
    expect(normalizeBoxHost("http://")).toBeNull();
  });
});

describe("resolveDefaultBoxHost", () => {
  it("prefers AIBOX_HOST", () => {
    expect(resolveDefaultBoxHost({ AIBOX_HOST: "10.0.0.5", NEXT_PUBLIC_AIBOX_HOST: "10.0.0.9" })).toBe(
      "http://10.0.0.5"
    );
  });

  it("falls back to NEXT_PUBLIC_AIBOX_HOST for existing deploys", () => {
    expect(resolveDefaultBoxHost({ NEXT_PUBLIC_AIBOX_HOST: "10.0.0.9" })).toBe("http://10.0.0.9");
  });

  it("falls back to the LAN default when env is empty or invalid", () => {
    expect(resolveDefaultBoxHost({})).toBe(FALLBACK_BOX_HOST);
    expect(resolveDefaultBoxHost({ AIBOX_HOST: "ftp://nope" })).toBe(FALLBACK_BOX_HOST);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/aibox/box-settings.test.ts`
Expected: FAIL — không resolve được `./box-settings` (file chưa tồn tại).

- [x] **Step 3: Write minimal implementation**

Create `src/lib/aibox/box-settings.ts`:

```ts
// Cấu hình host AI Box. Thuần + không I/O để unit-test được và dùng chung
// cho cả API route (server) lẫn trang Camera (client).

/** Khoá của doc trong collection `settings` giữ host AI Box. */
export const SETTING_KEY_BOX_HOST = "boxHost";

/** Host mặc định cuối cùng khi DB lẫn env đều không có (box trên LAN chùa). */
export const FALLBACK_BOX_HOST = "http://192.168.1.26";

/**
 * Chuẩn hoá host người dùng nhập về dạng origin chuẩn, hoặc null nếu không thể
 * dùng làm host http(s). Chấp nhận host trần ("192.168.1.26:8080") bằng cách
 * mặc định http, và cắt bỏ path/dấu / thừa.
 */
export function normalizeBoxHost(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Có "://" thì scheme phải là http/https; không có thì coi là host trần.
  // "javascript:alert(1)" không có "://" nên rơi xuống nhánh host trần và bị
  // new URL() loại vì port không hợp lệ.
  const sep = trimmed.indexOf("://");
  if (sep > -1 && !/^https?$/i.test(trimmed.slice(0, sep))) return null;
  const withScheme = sep > -1 ? trimmed : `http://${trimmed}`;

  try {
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname) return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * Host mặc định khi DB chưa có bản ghi. AIBOX_HOST là mặc định phía server;
 * NEXT_PUBLIC_AIBOX_HOST giữ lại để không phá deploy cũ đang set biến này.
 */
export function resolveDefaultBoxHost(env: {
  AIBOX_HOST?: string;
  NEXT_PUBLIC_AIBOX_HOST?: string;
}): string {
  return (
    normalizeBoxHost(env.AIBOX_HOST ?? "") ??
    normalizeBoxHost(env.NEXT_PUBLIC_AIBOX_HOST ?? "") ??
    FALLBACK_BOX_HOST
  );
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/aibox/box-settings.test.ts`
Expected: PASS — 11 test.

- [ ] **Step 5: Commit**

```bash
git add src/lib/aibox/box-settings.ts src/lib/aibox/box-settings.test.ts
git commit -m "feat(settings): add box host normalization helpers"
```

---

### Task 2: Model settings key/value

**Files:**
- Create: `src/models/app-setting.ts`

**Interfaces:**
- Consumes: (không)
- Produces: `AppSettingModel: Model<AppSettingDocument>`, `AppSettingDocument { key: string; value: string; createdAt: Date; updatedAt: Date }`

- [x] **Step 1: Write the model**

Create `src/models/app-setting.ts` (theo pattern `src/models/alarm.ts`):

```ts
import mongoose, { Model, Schema } from "mongoose";

// Kho key/value cho cấu hình chỉnh được từ trang Cài đặt. Hiện chỉ giữ
// `boxHost`; thêm setting mới chỉ cần thêm khoá, không cần model mới.
export interface AppSettingDocument {
  key: string;
  value: string;
  createdAt: Date;
  updatedAt: Date;
}

const AppSettingSchema = new Schema<AppSettingDocument>(
  {
    key: { type: String, required: true, unique: true, index: true },
    value: { type: String, required: true }
  },
  {
    collection: "settings",
    timestamps: true
  }
);

export const AppSettingModel: Model<AppSettingDocument> =
  mongoose.models.AppSetting || mongoose.model<AppSettingDocument>("AppSetting", AppSettingSchema);
```

- [x] **Step 2: Verify it typechecks**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "app-setting|box-settings" || echo "OK: không có lỗi ở file mới"`
Expected: `OK: không có lỗi ở file mới`

(Lưu ý: repo đang có sẵn 2 lỗi tsc ở test cũ `auth`/`image-storage` — không liên quan, bỏ qua.)

- [ ] **Step 3: Commit**

```bash
git add src/models/app-setting.ts
git commit -m "feat(settings): add app settings key/value model"
```

---

### Task 3: API đọc/ghi host box

**Files:**
- Create: `src/app/api/settings/box-host/route.ts`

**Interfaces:**
- Consumes: `SETTING_KEY_BOX_HOST`, `normalizeBoxHost`, `resolveDefaultBoxHost` (Task 1); `AppSettingModel` (Task 2); `connectMongo` từ `@/lib/mongodb`.
- Produces: `GET /api/settings/box-host` → `{ ok: true, boxHost: string }`; `PUT` body `{ boxHost: string }` → `{ ok: true, boxHost: string }` hoặc `400 { ok: false, error: string }`.

- [x] **Step 1: Write the route**

Create `src/app/api/settings/box-host/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectMongo } from "@/lib/mongodb";
import { AppSettingModel } from "@/models/app-setting";
import {
  SETTING_KEY_BOX_HOST,
  normalizeBoxHost,
  resolveDefaultBoxHost
} from "@/lib/aibox/box-settings";

export const runtime = "nodejs";

const bodySchema = z.object({ boxHost: z.string().min(1) });

export async function GET() {
  await connectMongo();
  const doc = await AppSettingModel.findOne({ key: SETTING_KEY_BOX_HOST }).lean<{ value: string } | null>();
  return NextResponse.json({ ok: true, boxHost: doc?.value ?? resolveDefaultBoxHost(process.env) });
}

export async function PUT(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const boxHost = normalizeBoxHost(parsed.data.boxHost);
  if (!boxHost) {
    return NextResponse.json(
      { ok: false, error: "Địa chỉ box không hợp lệ (ví dụ: http://192.168.1.26)" },
      { status: 400 }
    );
  }

  await connectMongo();
  await AppSettingModel.updateOne({ key: SETTING_KEY_BOX_HOST }, { $set: { value: boxHost } }, { upsert: true });

  return NextResponse.json({ ok: true, boxHost });
}
```

- [x] **Step 2: Verify GET works against local mongod**

Dev server đã chạy sẵn ở port 3000 (SessionStart hook). API sau đăng nhập → dùng cookie phiên là phức tạp; kiểm nhanh bằng cách xác nhận route trả 401 khi chưa auth (chứng tỏ route tồn tại + proxy guard chạy):

Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/settings/box-host`
Expected: `401`

- [ ] **Step 3: Commit**

```bash
git add src/app/api/settings/box-host/route.ts
git commit -m "feat(settings): add box host settings API"
```

---

### Task 4: Card cấu hình host ở trang Cài đặt

**Files:**
- Create: `src/components/settings/box-host-setting.tsx`
- Modify: `src/components/settings-view.tsx`

**Interfaces:**
- Consumes: `GET/PUT /api/settings/box-host` (Task 3); `Card`, `CardContent`, `CardHeader`, `CardTitle` từ `@/components/ui/card`.
- Produces: `BoxHostSetting()` — React client component, tự bọc `<Card>`.

- [x] **Step 1: Write the component**

Create `src/components/settings/box-host-setting.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function BoxHostSetting() {
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings/box-host")
      .then((r) => r.json())
      .then((d: { boxHost?: string }) => {
        if (!cancelled && d.boxHost) setValue(d.boxHost);
      })
      .catch(() => {
        if (!cancelled) setError("Không tải được cấu hình hiện tại");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/settings/box-host", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boxHost: value })
      });
      const data = (await res.json()) as { ok?: boolean; boxHost?: string; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Lưu không thành công");
        return;
      }
      if (data.boxHost) setValue(data.boxHost);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1500);
    } catch {
      setError("Lưu không thành công");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI Box</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Địa chỉ AI Box cho trang Camera trực tiếp (player WebRTC và link mở giao diện box). Đổi
          xong mở lại trang Camera là áp dụng.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={loading || saving}
            placeholder="http://192.168.1.26"
            className="min-w-0 flex-1 rounded-md border border-border bg-card px-3 py-2 font-mono text-sm text-foreground disabled:opacity-50"
          />
          <button
            type="button"
            onClick={save}
            disabled={loading || saving}
            className="inline-flex h-9 items-center rounded-md bg-brand px-3 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? "Đang lưu…" : saved ? "Đã lưu" : "Lưu"}
          </button>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
```

- [x] **Step 2: Wire it into the settings page**

Modify `src/components/settings-view.tsx` — thêm import (cạnh các import component khác):

```tsx
import { BoxHostSetting } from "@/components/settings/box-host-setting";
```

Rồi render ngay sau `</Card>` của card "URL nhận cảnh báo (Webhook)" và trước `<div className="grid gap-4 md:grid-cols-2">`:

```tsx
      <BoxHostSetting />
```

- [x] **Step 3: Verify lint + types**

Run: `npx eslint src/components/settings/box-host-setting.tsx src/components/settings-view.tsx`
Expected: không có output (sạch).

- [ ] **Step 4: Commit**

```bash
git add src/components/settings/box-host-setting.tsx src/components/settings-view.tsx
git commit -m "feat(settings): add box host card to settings page"
```

---

### Task 5: Trang Camera đọc host + click khung video mở box

**Files:**
- Modify: `src/components/camera-webrtc.tsx`

**Interfaces:**
- Consumes: `FALLBACK_BOX_HOST` (Task 1); `GET /api/settings/box-host` (Task 3).
- Produces: (không — là màn hình cuối)

- [x] **Step 1: Replace the hardcoded host with fetched state**

Rewrite `src/components/camera-webrtc.tsx` thành:

```tsx
"use client";

import { ExternalLink } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { FALLBACK_BOX_HOST } from "@/lib/aibox/box-settings";

// AI Box (ZLMediaKit WebRTC). Host lấy từ cấu hình runtime (Cài đặt → AI Box)
// nên đổi được mà không cần build lại. Dạng URL signaling lấy từ UI box:
// <host>/webrtc?app=<app>&stream=<stream>&type=play
const DEFAULT_CHANNEL = process.env.NEXT_PUBLIC_AIBOX_CHANNEL || "group/1"; // app/stream

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Zlm = any;

// Script player không phụ thuộc host (chỉ URL signaling mới dùng host), nên
// cache theo window là an toàn kể cả khi host đổi giữa chừng.
function loadZlmClient(host: string): Promise<Zlm> {
  return new Promise((resolve, reject) => {
    const w = window as unknown as { ZLMRTCClient?: Zlm };
    if (w.ZLMRTCClient) return resolve(w.ZLMRTCClient);
    const s = document.createElement("script");
    s.src = `${host}/dist/ZLMRTCClient.js`;
    s.onload = () => (w.ZLMRTCClient ? resolve(w.ZLMRTCClient) : reject(new Error("ZLMRTCClient not found")));
    s.onerror = () => reject(new Error("load failed"));
    document.body.appendChild(s);
  });
}

export function CameraWebrtc() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const clientRef = useRef<Zlm>(null);
  const [boxHost, setBoxHost] = useState<string | null>(null);
  const [cameras, setCameras] = useState<string[]>([]);
  const [channel, setChannel] = useState(DEFAULT_CHANNEL);
  const [pending, setPending] = useState(DEFAULT_CHANNEL);
  const [status, setStatus] = useState("Đang tải cấu hình…");

  // Host cấu hình runtime; lỗi mạng thì vẫn thử host LAN mặc định.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings/box-host")
      .then((r) => r.json())
      .then((d: { boxHost?: string }) => {
        if (!cancelled) setBoxHost(d.boxHost || FALLBACK_BOX_HOST);
      })
      .catch(() => {
        if (!cancelled) setBoxHost(FALLBACK_BOX_HOST);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!boxHost) return;
    let cancelled = false;
    fetch(`${boxHost}/api/alg_media_fetch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}"
    })
      .then((r) => r.json())
      .then((d: { Content?: { MediaName?: string }[] }) => {
        if (cancelled) return;
        const names = (d.Content ?? []).map((m) => m.MediaName).filter((n): n is string => !!n);
        setCameras(names);
      })
      .catch(() => {
        if (!cancelled) setStatus("Không lấy được danh sách camera (cùng LAN với box?)");
      });
    return () => {
      cancelled = true;
    };
  }, [boxHost]);

  useEffect(() => {
    if (!boxHost) return;
    let cancelled = false;
    void (async () => {
      setStatus("Đang kết nối…");
      try {
        const ZLM = await loadZlmClient(boxHost);
        if (cancelled || !videoRef.current) return;
        clientRef.current?.close?.();
        const [app, stream] = channel.split("/");
        const url = `${boxHost}/webrtc?app=${encodeURIComponent(app)}&stream=${encodeURIComponent(stream ?? "")}&type=play`;
        const client = new ZLM.Endpoint({
          element: videoRef.current,
          debug: false,
          zlmsdpUrl: url,
          simulcast: false,
          useCamera: false,
          audioEnable: false,
          videoEnable: true,
          recvOnly: true,
          usedatachannel: false
        });
        client.on(ZLM.Events.WEBRTC_ON_REMOTE_STREAMS, () => !cancelled && setStatus("Đang phát"));
        client.on(ZLM.Events.WEBRTC_ANSWER_EXCHANGE_FAILED, (e: unknown) =>
          !cancelled && setStatus(`Lỗi WebRTC: ${JSON.stringify(e).slice(0, 120)}`)
        );
        clientRef.current = client;
      } catch (e) {
        if (!cancelled) setStatus(`Không tải được player: ${(e as Error).message}`);
      }
    })();
    return () => {
      cancelled = true;
      clientRef.current?.close?.();
    };
  }, [channel, boxHost]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-brand">Camera</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">Xem trực tiếp AI Box</h2>
        </div>
        {boxHost ? (
          <a
            href={`${boxHost}/#/preview/video`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground transition hover:text-foreground"
          >
            <ExternalLink className="size-4" />
            Mở UI box
          </a>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-md border border-border p-0.5">
          {Array.from({ length: Math.max(1, Math.ceil(cameras.length / 9)) }, (_, i) => i + 1).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => {
                const c = `group/${g}`;
                setChannel(c);
                setPending(c);
              }}
              className={cn(
                "rounded px-3 py-1 text-sm font-medium transition",
                channel === `group/${g}`
                  ? "bg-brand text-white"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Nhóm {g}
            </button>
          ))}
        </div>
        <input
          value={pending}
          onChange={(e) => setPending(e.target.value)}
          placeholder="app/stream (vd group/1)"
          className="w-40 rounded-md border border-border bg-card px-2 py-1 text-sm text-foreground"
        />
        <button
          type="button"
          onClick={() => setChannel(pending)}
          className="rounded-md bg-brand px-3 py-1 text-sm font-medium text-white"
        >
          Phát
        </button>
        <span className="text-xs text-muted-foreground">{status}</span>
      </div>

      {/* Khung xem to gần bằng viewport. Trang /camera bỏ giới hạn max-w-7xl
          (xem app-shell) nên khung dùng hết bề ngang; object-contain giữ nguyên
          tỉ lệ mosaic, không méo/cắt. Overlay phủ khung để click mở UI box, nên
          <video> bỏ `controls` (overlay che thanh controls → xung đột click);
          luồng mosaic live autoplay/muted không cần play/pause. */}
      <div className="relative h-[calc(100dvh-12rem)] min-h-[24rem] w-full overflow-hidden rounded-xl border border-border bg-black">
        <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-contain" />
        {boxHost ? (
          <a
            href={boxHost}
            target="_blank"
            rel="noreferrer"
            title="Mở giao diện box"
            className="absolute inset-0 flex cursor-pointer items-center justify-center opacity-0 transition hover:bg-black/40 hover:opacity-100"
          >
            <span className="inline-flex items-center gap-2 rounded-md bg-black/70 px-3 py-2 text-sm font-medium text-white">
              <ExternalLink className="size-4" />
              Mở giao diện box
            </span>
          </a>
        ) : null}
      </div>

      <p className="text-xs text-muted-foreground">
        Player WebRTC nối thẳng tới AI Box (ZLMediaKit). Box chỉ phát <strong>theo nhóm (mosaic
        9 ô)</strong> qua WebRTC — xem 1 camera riêng cần player h265/WebSocket (chưa hỗ trợ). Chỉ
        chạy khi máy xem cùng LAN với box và dashboard chạy HTTP. Nguồn:{" "}
        <code className="rounded bg-muted px-1">{boxHost ?? "…"}/webrtc?app=group&stream=N</code>. Đổi
        địa chỉ box ở trang <strong>Cài đặt</strong>.
      </p>
    </div>
  );
}
```

- [x] **Step 2: Verify lint + types**

Run: `npx eslint src/components/camera-webrtc.tsx && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "camera-webrtc|box-settings|app-setting|box-host" || echo "OK: không có lỗi ở file đụng tới"`
Expected: `OK: không có lỗi ở file đụng tới`

- [x] **Step 3: Run the full test suite (không vỡ gì)**

Run: `npm test`
Expected: PASS toàn bộ, gồm 11 test mới của Task 1. Không được có test nào chuyển từ pass sang fail
so với trước khi làm plan này.

- [ ] **Step 4: Commit**

```bash
git add src/components/camera-webrtc.tsx
git commit -m "feat(camera): read box host from settings, click frame to open box UI"
```

---

### Task 6: Ghi chú env

**Files:**
- Modify: `.env.example`

- [x] **Step 1: Document the server-side default**

Thêm vào cuối `.env.example`:

```text
# Host AI Box mac dinh khi DB chua co cau hinh (doi trong Cai dat -> AI Box).
AIBOX_HOST=http://192.168.1.26
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "docs: document AIBOX_HOST default"
```

---

## Nghiệm thu (user tự làm — trang sau đăng nhập)

1. Đăng nhập dashboard → **Cài đặt** → card **AI Box** hiện host hiện tại.
2. Nhập host sai (vd `ftp://x`) → bấm Lưu → hiện lỗi đỏ, không lưu.
3. Nhập host đúng → Lưu → nút hiện "Đã lưu"; F5 vẫn giữ giá trị (đã vào Mongo).
4. Mở **Camera trực tiếp** → player nối tới host vừa đặt (xem dòng `Nguồn:` ở cuối trang).
5. Hover khung video → hiện overlay "Mở giao diện box"; click → mở host đó ở **tab mới**.

## Câu hỏi mở

- Không có.
