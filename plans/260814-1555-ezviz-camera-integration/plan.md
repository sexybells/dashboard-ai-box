# EZVIZ Camera Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xem trực tiếp, xem lại và điều khiển PTZ camera EZVIZ ngay trong trang Camera của dashboard, sống chung với camera RTSP/MediaMTX hiện có.

**Architecture:** `appKey`/`appSecret` chỉ ở server, lưu trong collection `settings`. Server gọi EZVIZ Open Platform (region US `iusopen.ezvizlife.com`) để lấy token, đồng bộ thiết bị, cấp URL `ezopen://` và proxy lệnh PTZ. Trình duyệt phát bằng `ezuikit-js`. Camera EZVIZ dùng chung collection `cameras` với camera RTSP, phân biệt bằng trường `source`, và **không** đi qua MediaMTX.

**Tech Stack:** Next.js App Router (route handlers `runtime = "nodejs"`), Mongoose, zod, vitest, `ezuikit-js`.

**Spec:** `docs/superpowers/specs/2026-08-14-ezviz-camera-integration-design.md`

## Global Constraints

- Tiếng Việt cho mọi thông điệp lỗi hiển thị cho người dùng.
- Không commit `appKey`, `appSecret`, `accessToken`, mã xác minh vào repo — kể cả trong test fixture. Test dùng giá trị giả (`"test-key"`).
- Tên file kebab-case. Logic thuần trong `src/lib/aibox/`, I/O trong route handler, fetcher trong `src/services/`.
- Mọi route mới: `export const runtime = "nodejs"`.
- Domain API mặc định khi chưa ghim: thử lần lượt `iusopen.ezvizlife.com`, `isgpopen.ezvizlife.com`, `ieuopen.ezvizlife.com`, `iindiaopen.ezvizlife.com`, `open.ys7.com`.
- Host trong URL `ezopen://` luôn là `open.ezviz.com`, không phải domain API.
- `video/by/time` dùng epoch **milliseconds**, `recType=2` (cloud).
- Test chỉ phủ hàm thuần; route + player kiểm tay trên camera `BE4583385`.
- Chạy test: `npx vitest run <path>`. Lint: `npm run lint`. Build: `npm run build`.

---

### Task 1: Client HTTP EZVIZ + chuẩn hoá lỗi

**Files:**
- Create: `src/lib/aibox/ezviz-api.ts`
- Test: `src/lib/aibox/ezviz-api.test.ts`

**Interfaces:**
- Consumes: (không có — task đầu)
- Produces:
  - `class EzvizError extends Error { code: string }`
  - `parseEzvizBody(raw: string): { code: string; msg: string; data: unknown; page?: unknown }` — ném `EzvizError` khi thân không phải JSON.
  - `EZVIZ_AREA_DOMAINS: readonly string[]`
  - `postEzviz<T>(domain: string, path: string, params: Record<string, string | number>): Promise<T>` — ném `EzvizError` khi `code !== "200"`.

- [ ] **Step 1: Viết test thất bại**

```ts
// src/lib/aibox/ezviz-api.test.ts
import { describe, expect, it } from "vitest";
import { EzvizError, parseEzvizBody } from "./ezviz-api";

describe("parseEzvizBody", () => {
  it("đọc được response thành công", () => {
    const r = parseEzvizBody('{"code":"200","msg":"Operation succeeded","data":[]}');
    expect(r.code).toBe("200");
    expect(r.data).toEqual([]);
  });

  it("giữ nguyên mã lỗi EZVIZ để tầng trên xử lý", () => {
    const r = parseEzvizBody('{"msg":"AccessToken expired or error.","code":"10002"}');
    expect(r.code).toBe("10002");
  });

  // Đã gặp thật: gọi sai endpoint, EZVIZ trả trang lỗi Tomcat chứ không phải JSON.
  it("ném EzvizError khi thân không phải JSON", () => {
    expect(() => parseEzvizBody("<!DOCTYPE html><html><head><title>Apache Tomcat")).toThrow(
      EzvizError
    );
    try {
      parseEzvizBody("<!DOCTYPE html>");
    } catch (e) {
      expect((e as EzvizError).code).toBe("INVALID_RESPONSE");
    }
  });
});
```

- [ ] **Step 2: Chạy test để chắc chắn nó fail**

Run: `npx vitest run src/lib/aibox/ezviz-api.test.ts`
Expected: FAIL — không import được `./ezviz-api`.

- [ ] **Step 3: Viết implementation tối thiểu**

```ts
// src/lib/aibox/ezviz-api.ts
// Client HTTP tới EZVIZ Open Platform. Mọi lệnh là POST form-urlencoded và
// LUÔN trả HTTP 200 — lỗi nằm trong trường `code` của thân JSON, nên không
// được tin `response.ok`. Gọi sai endpoint thì EZVIZ trả HTML Tomcat.

/** Lỗi mang mã EZVIZ để tầng trên quyết định retry / báo người dùng. */
export class EzvizError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "EzvizError";
  }
}

/** Domain theo region. appKey chỉ sống ở đúng một region. */
export const EZVIZ_AREA_DOMAINS = [
  "https://iusopen.ezvizlife.com",
  "https://isgpopen.ezvizlife.com",
  "https://ieuopen.ezvizlife.com",
  "https://iindiaopen.ezvizlife.com",
  "https://open.ys7.com"
] as const;

export interface EzvizBody {
  code: string;
  msg: string;
  data: unknown;
  page?: unknown;
}

export function parseEzvizBody(raw: string): EzvizBody {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new EzvizError("INVALID_RESPONSE", "EZVIZ trả về dữ liệu không đọc được");
  }
  if (!parsed || typeof parsed !== "object" || !("code" in parsed)) {
    throw new EzvizError("INVALID_RESPONSE", "EZVIZ trả về dữ liệu không đọc được");
  }
  const body = parsed as { code: unknown; msg?: unknown; data?: unknown; page?: unknown };
  return {
    code: String(body.code),
    msg: typeof body.msg === "string" ? body.msg : "",
    data: body.data ?? null,
    page: body.page
  };
}

/** POST form-urlencoded, ném EzvizError khi code khác "200". */
export async function postEzviz<T>(
  domain: string,
  path: string,
  params: Record<string, string | number>
): Promise<T> {
  const form = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) form.set(k, String(v));

  const res = await fetch(`${domain}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000)
  });

  const body = parseEzvizBody(await res.text());
  if (body.code !== "200") throw new EzvizError(body.code, body.msg);
  return body.data as T;
}
```

- [ ] **Step 4: Chạy test để chắc chắn pass**

Run: `npx vitest run src/lib/aibox/ezviz-api.test.ts`
Expected: PASS (3 test).

- [ ] **Step 5: Commit**

```bash
git add src/lib/aibox/ezviz-api.ts src/lib/aibox/ezviz-api.test.ts
git commit -m "feat(ezviz): client HTTP + chuan hoa loi EZVIZ"
```

---

### Task 2: Vòng đời accessToken

**Files:**
- Create: `src/lib/aibox/ezviz-token.ts`
- Test: `src/lib/aibox/ezviz-token.test.ts`

**Interfaces:**
- Consumes: `postEzviz`, `EzvizError`, `EZVIZ_AREA_DOMAINS` từ Task 1.
- Produces:
  - `SETTING_KEY_EZVIZ_APP_KEY`, `SETTING_KEY_EZVIZ_APP_SECRET`, `SETTING_KEY_EZVIZ_AREA_DOMAIN`, `SETTING_KEY_EZVIZ_TOKEN`, `SETTING_KEY_EZVIZ_TOKEN_EXPIRE_AT` — hằng chuỗi.
  - `shouldRefreshToken(cached: { token: string; expireAt: number } | null, now: number): boolean`
  - `getEzvizToken(): Promise<{ token: string; domain: string }>` — đọc/ghi `settings`, tự dò domain lần đầu.
  - `withTokenRetry<T>(fn: (t: { token: string; domain: string }) => Promise<T>): Promise<T>` — gặp `10002` thì làm mới token **một lần** rồi thử lại.

- [ ] **Step 1: Viết test thất bại**

```ts
// src/lib/aibox/ezviz-token.test.ts
import { describe, expect, it } from "vitest";
import { shouldRefreshToken } from "./ezviz-token";

const NOW = 1_787_000_000_000;
const DAY = 86_400_000;

describe("shouldRefreshToken", () => {
  it("chưa có cache thì phải lấy mới", () => {
    expect(shouldRefreshToken(null, NOW)).toBe(true);
  });

  it("còn hạn dài thì dùng lại", () => {
    expect(shouldRefreshToken({ token: "t", expireAt: NOW + 5 * DAY }, NOW)).toBe(false);
  });

  // Làm mới sớm 1 ngày để không có cửa sổ token chết giữa hai lần cron.
  it("còn dưới 1 ngày thì làm mới sớm", () => {
    expect(shouldRefreshToken({ token: "t", expireAt: NOW + DAY / 2 }, NOW)).toBe(true);
  });

  it("đã hết hạn thì làm mới", () => {
    expect(shouldRefreshToken({ token: "t", expireAt: NOW - 1 }, NOW)).toBe(true);
  });

  it("token rỗng coi như không có", () => {
    expect(shouldRefreshToken({ token: "", expireAt: NOW + 5 * DAY }, NOW)).toBe(true);
  });
});
```

- [ ] **Step 2: Chạy test để chắc chắn nó fail**

Run: `npx vitest run src/lib/aibox/ezviz-token.test.ts`
Expected: FAIL — `shouldRefreshToken` chưa tồn tại.

- [ ] **Step 3: Viết implementation**

```ts
// src/lib/aibox/ezviz-token.ts
// Vòng đời accessToken EZVIZ. Token sống ~7 ngày; cache trong collection
// `settings` để không gọi token/get mỗi request (EZVIZ có quota).
// Phần quyết định tách thành hàm thuần để test không cần Mongo.

import { EZVIZ_AREA_DOMAINS, EzvizError, postEzviz } from "@/lib/aibox/ezviz-api";
import { connectMongo } from "@/lib/mongodb";
import { AppSettingModel } from "@/models/app-setting";

export const SETTING_KEY_EZVIZ_APP_KEY = "ezvizAppKey";
export const SETTING_KEY_EZVIZ_APP_SECRET = "ezvizAppSecret";
export const SETTING_KEY_EZVIZ_AREA_DOMAIN = "ezvizAreaDomain";
export const SETTING_KEY_EZVIZ_TOKEN = "ezvizToken";
export const SETTING_KEY_EZVIZ_TOKEN_EXPIRE_AT = "ezvizTokenExpireAt";

/** Làm mới sớm 1 ngày trước hạn để không có cửa sổ token chết. */
const REFRESH_MARGIN_MS = 86_400_000;

export function shouldRefreshToken(
  cached: { token: string; expireAt: number } | null,
  now: number
): boolean {
  if (!cached || !cached.token) return true;
  return cached.expireAt - REFRESH_MARGIN_MS <= now;
}

async function readSettings(keys: string[]): Promise<Map<string, string>> {
  await connectMongo();
  const docs = await AppSettingModel.find({ key: { $in: keys } }).lean<
    { key: string; value: string }[]
  >();
  return new Map(docs.map((d) => [d.key, d.value]));
}

async function writeSetting(key: string, value: string): Promise<void> {
  await AppSettingModel.updateOne({ key }, { $set: { value } }, { upsert: true });
}

interface TokenResponse {
  accessToken: string;
  expireTime: number;
  areaDomain: string;
}

/**
 * Lấy token dùng được. Lần đầu chưa biết region → thử lần lượt các domain đã
 * biết rồi ghim domain thành công vào settings; các lần sau gọi thẳng.
 */
export async function getEzvizToken(): Promise<{ token: string; domain: string }> {
  const s = await readSettings([
    SETTING_KEY_EZVIZ_APP_KEY,
    SETTING_KEY_EZVIZ_APP_SECRET,
    SETTING_KEY_EZVIZ_AREA_DOMAIN,
    SETTING_KEY_EZVIZ_TOKEN,
    SETTING_KEY_EZVIZ_TOKEN_EXPIRE_AT
  ]);

  const appKey = s.get(SETTING_KEY_EZVIZ_APP_KEY);
  const appSecret = s.get(SETTING_KEY_EZVIZ_APP_SECRET);
  if (!appKey || !appSecret) {
    throw new EzvizError("NOT_CONFIGURED", "Chưa cấu hình EZVIZ trong Cài đặt");
  }

  const pinned = s.get(SETTING_KEY_EZVIZ_AREA_DOMAIN);
  const cached = {
    token: s.get(SETTING_KEY_EZVIZ_TOKEN) ?? "",
    expireAt: Number(s.get(SETTING_KEY_EZVIZ_TOKEN_EXPIRE_AT) ?? 0)
  };

  if (pinned && !shouldRefreshToken(cached, Date.now())) {
    return { token: cached.token, domain: pinned };
  }

  const candidates = pinned ? [pinned] : EZVIZ_AREA_DOMAINS;
  let lastError: unknown = null;
  for (const domain of candidates) {
    try {
      const data = await postEzviz<TokenResponse>(domain, "/api/lapp/token/get", {
        appKey,
        appSecret
      });
      // token/get trả kèm areaDomain — tin nó hơn domain mình đoán.
      const resolved = data.areaDomain || domain;
      await writeSetting(SETTING_KEY_EZVIZ_AREA_DOMAIN, resolved);
      await writeSetting(SETTING_KEY_EZVIZ_TOKEN, data.accessToken);
      await writeSetting(SETTING_KEY_EZVIZ_TOKEN_EXPIRE_AT, String(data.expireTime));
      return { token: data.accessToken, domain: resolved };
    } catch (e) {
      lastError = e;
      // 10017 = appKey không thuộc region này → thử domain kế tiếp.
      if (e instanceof EzvizError && e.code === "10017") continue;
      throw e;
    }
  }
  if (lastError instanceof EzvizError && lastError.code === "10017") {
    throw new EzvizError("10017", "AppKey không đúng hoặc không thuộc region nào đã biết");
  }
  throw lastError ?? new EzvizError("UNKNOWN", "Không lấy được token EZVIZ");
}

/** Gặp token hết hạn thì làm mới MỘT lần rồi thử lại — không lặp vô hạn. */
export async function withTokenRetry<T>(
  fn: (auth: { token: string; domain: string }) => Promise<T>
): Promise<T> {
  const auth = await getEzvizToken();
  try {
    return await fn(auth);
  } catch (e) {
    if (!(e instanceof EzvizError) || e.code !== "10002") throw e;
    await writeSetting(SETTING_KEY_EZVIZ_TOKEN, "");
    return fn(await getEzvizToken());
  }
}
```

- [ ] **Step 4: Chạy test để chắc chắn pass**

Run: `npx vitest run src/lib/aibox/ezviz-token.test.ts`
Expected: PASS (5 test).

- [ ] **Step 5: Commit**

```bash
git add src/lib/aibox/ezviz-token.ts src/lib/aibox/ezviz-token.test.ts
git commit -m "feat(ezviz): vong doi accessToken + tu do region"
```

---

### Task 3: Map thiết bị và dựng URL ezopen

**Files:**
- Create: `src/lib/aibox/ezviz-devices.ts`
- Test: `src/lib/aibox/ezviz-devices.test.ts`

**Interfaces:**
- Consumes: (không phụ thuộc task trước — thuần)
- Produces:
  - `interface EzvizDevice { deviceSerial: string; deviceName: string; status: number; model?: string }`
  - `interface EzvizChannel { deviceSerial: string; channelNo: number; isEncrypt: number }`
  - `interface EzvizCameraSync { serial: string; channel: number; name: string; online: boolean; encrypted: boolean }`
  - `mergeDeviceList(devices: EzvizDevice[], channels: EzvizChannel[]): EzvizCameraSync[]`
  - `buildEzopenUrl(o: { serial: string; channel: number; verifyCode?: string; kind: "live" | "rec"; hd?: boolean }): string`
  - `msToDate(ms: number): Date`, `dateToMs(d: Date): number`

- [ ] **Step 1: Viết test thất bại**

```ts
// src/lib/aibox/ezviz-devices.test.ts
import { describe, expect, it } from "vitest";
import { buildEzopenUrl, dateToMs, mergeDeviceList, msToDate } from "./ezviz-devices";

describe("mergeDeviceList", () => {
  it("ghép device với channel để biết kênh nào bật mã hoá", () => {
    const out = mergeDeviceList(
      [{ deviceSerial: "BE4583385", deviceName: "H6C", status: 1, model: "CS-H6c" }],
      [{ deviceSerial: "BE4583385", channelNo: 1, isEncrypt: 1 }]
    );
    expect(out).toEqual([
      { serial: "BE4583385", channel: 1, name: "H6C", online: true, encrypted: true }
    ]);
  });

  it("device không có channel vẫn ra kênh 1 mặc định", () => {
    const out = mergeDeviceList([{ deviceSerial: "X1", deviceName: "Cam", status: 0 }], []);
    expect(out).toEqual([
      { serial: "X1", channel: 1, name: "Cam", online: false, encrypted: false }
    ]);
  });

  it("device nhiều kênh sinh nhiều dòng", () => {
    const out = mergeDeviceList(
      [{ deviceSerial: "N1", deviceName: "NVR", status: 1 }],
      [
        { deviceSerial: "N1", channelNo: 1, isEncrypt: 0 },
        { deviceSerial: "N1", channelNo: 2, isEncrypt: 1 }
      ]
    );
    expect(out).toHaveLength(2);
    expect(out[1]).toEqual({
      serial: "N1",
      channel: 2,
      name: "NVR",
      online: true,
      encrypted: true
    });
  });
});

describe("buildEzopenUrl", () => {
  // Host trong URL ezopen là open.ezviz.com, KHÁC domain API của region.
  it("dựng URL live có mã xác minh", () => {
    expect(
      buildEzopenUrl({ serial: "BE4583385", channel: 1, verifyCode: "ABCDEF", kind: "live", hd: true })
    ).toBe("ezopen://ABCDEF@open.ezviz.com/BE4583385/1.hd.live");
  });

  it("không có mã xác minh thì bỏ phần userinfo", () => {
    expect(buildEzopenUrl({ serial: "X1", channel: 1, kind: "live" })).toBe(
      "ezopen://open.ezviz.com/X1/1.live"
    );
  });

  it("dựng URL xem lại", () => {
    expect(
      buildEzopenUrl({ serial: "X1", channel: 2, verifyCode: "AB", kind: "rec" })
    ).toBe("ezopen://AB@open.ezviz.com/X1/2.rec");
  });
});

describe("msToDate / dateToMs", () => {
  it("đi và về không đổi giá trị", () => {
    // video/by/time dùng epoch ms, không phải chuỗi ngày như tài liệu ghi.
    expect(dateToMs(msToDate(1786695900000))).toBe(1786695900000);
  });
});
```

- [ ] **Step 2: Chạy test để chắc chắn nó fail**

Run: `npx vitest run src/lib/aibox/ezviz-devices.test.ts`
Expected: FAIL — module chưa tồn tại.

- [ ] **Step 3: Viết implementation**

```ts
// src/lib/aibox/ezviz-devices.ts
// Hàm thuần biến dữ liệu EZVIZ thành thứ dashboard dùng được. Không I/O để
// test không cần mạng lẫn Mongo.

/** Host cố định trong URL ezopen — KHÁC domain API theo region. */
const EZOPEN_HOST = "open.ezviz.com";

export interface EzvizDevice {
  deviceSerial: string;
  deviceName: string;
  status: number;
  model?: string;
}

export interface EzvizChannel {
  deviceSerial: string;
  channelNo: number;
  isEncrypt: number;
}

export interface EzvizCameraSync {
  serial: string;
  channel: number;
  name: string;
  online: boolean;
  encrypted: boolean;
}

/**
 * device/list cho tên + trạng thái, camera/list cho kênh + cờ mã hoá.
 * Device không có kênh nào (API lỗi một nửa) vẫn ra kênh 1 để không mất camera.
 */
export function mergeDeviceList(
  devices: EzvizDevice[],
  channels: EzvizChannel[]
): EzvizCameraSync[] {
  const out: EzvizCameraSync[] = [];
  for (const d of devices) {
    const own = channels.filter((c) => c.deviceSerial === d.deviceSerial);
    const list = own.length > 0 ? own : [{ deviceSerial: d.deviceSerial, channelNo: 1, isEncrypt: 0 }];
    for (const c of list) {
      out.push({
        serial: d.deviceSerial,
        channel: c.channelNo,
        name: d.deviceName,
        online: d.status === 1,
        encrypted: c.isEncrypt === 1
      });
    }
  }
  return out;
}

/** ezopen://<mã xác minh>@open.ezviz.com/<serial>/<kênh>[.hd].live|rec */
export function buildEzopenUrl(o: {
  serial: string;
  channel: number;
  verifyCode?: string;
  kind: "live" | "rec";
  hd?: boolean;
}): string {
  const auth = o.verifyCode ? `${o.verifyCode}@` : "";
  const quality = o.kind === "live" && o.hd ? ".hd" : "";
  return `ezopen://${auth}${EZOPEN_HOST}/${o.serial}/${o.channel}${quality}.${o.kind}`;
}

export function msToDate(ms: number): Date {
  return new Date(ms);
}

export function dateToMs(d: Date): number {
  return d.getTime();
}
```

- [ ] **Step 4: Chạy test để chắc chắn pass**

Run: `npx vitest run src/lib/aibox/ezviz-devices.test.ts`
Expected: PASS (7 test).

- [ ] **Step 5: Commit**

```bash
git add src/lib/aibox/ezviz-devices.ts src/lib/aibox/ezviz-devices.test.ts
git commit -m "feat(ezviz): map thiet bi + dung URL ezopen"
```

---

### Task 4: Mở rộng model `cameras` và cách ly MediaMTX

**Files:**
- Modify: `src/models/camera.ts`
- Modify: `src/app/api/cameras/route.ts` (hàm `GET`, và `POST` gán `source: "rtsp"`)
- Modify: `src/lib/aibox/mediamtx-paths.ts` (hàm `reconcileCameraPaths`)
- Modify: `src/services/camera-client.ts` (`CameraListItem`)

**Interfaces:**
- Consumes: `EzvizCameraSync` từ Task 3.
- Produces: `CameraDocument` có `source`, `ezvizSerial`, `ezvizChannel`, `ezvizVerifyCode`, `ezvizEncrypted`; `CameraListItem` có `source`, `ezvizSerial`, `needsVerifyCode`.

- [ ] **Step 1: Sửa schema**

Trong `src/models/camera.ts`, thêm vào `CameraDocument` và `CameraSchema`:

```ts
  /** Nguồn camera: "rtsp" đi qua MediaMTX, "ezviz" đi qua EZVIZ Cloud. */
  source: "rtsp" | "ezviz";
  /** Chỉ bắt buộc khi source === "rtsp". */
  rtspUrl?: string;
  ezvizSerial?: string;
  ezvizChannel?: number;
  /** Mã xác minh trên tem; thiếu → camera chưa phát được. */
  ezvizVerifyCode?: string;
  ezvizEncrypted?: boolean;
```

```ts
    source: { type: String, enum: ["rtsp", "ezviz"], required: true, default: "rtsp" },
    rtspUrl: { type: String },
    ezvizSerial: { type: String, index: true },
    ezvizChannel: { type: Number },
    ezvizVerifyCode: { type: String },
    ezvizEncrypted: { type: Boolean }
```

`rtspUrl` bỏ `required: true`. Doc cũ không có `source` → `default: "rtsp"` chỉ áp dụng cho doc mới, nên đọc phải coi thiếu `source` là `"rtsp"` (xử lý ở Step 3).

- [ ] **Step 2: Chặn MediaMTX chạm vào camera EZVIZ**

Trong `src/lib/aibox/mediamtx-paths.ts`, hàm `reconcileCameraPaths` lọc camera trước khi đồng bộ path:

```ts
  // Camera EZVIZ phát qua EZVIZ Cloud, không có path MediaMTX. Không lọc ở
  // đây thì cron sẽ cố tạo path cho camera không có rtspUrl mỗi phút.
  const rtspCameras = cameras.filter((c) => (c.source ?? "rtsp") === "rtsp" && c.rtspUrl);
```

Áp dụng cùng bộ lọc ở mọi nơi hàm này duyệt danh sách camera, và bảo đảm phần "xoá path lạ" chỉ so với `rtspCameras` chứ không xoá path của camera RTSP hợp lệ.

- [ ] **Step 3: `GET /api/cameras` trộn hai nguồn trạng thái**

Trong `src/app/api/cameras/route.ts`, `GET`: thêm các trường EZVIZ vào projection, và tính `online` theo nguồn.

```ts
  const docs = await CameraModel.find(
    {},
    {
      code: 1, name: 1, location: 1, rtspUrl: 1,
      source: 1, ezvizSerial: 1, ezvizChannel: 1, ezvizVerifyCode: 1, ezvizEncrypted: 1
    }
  ).sort({ code: 1 }).lean<CameraLean[]>();

  const readyByName = await fetchReadyByName();
  const cameras = docs.map((d) => {
    const source = d.source ?? "rtsp"; // doc cũ tạo trước khi có trường này
    return {
      code: d.code,
      name: d.name,
      location: d.location ?? "",
      source,
      rtspUrl: d.rtspUrl,
      ezvizSerial: d.ezvizSerial,
      // Mã xác minh KHÔNG trả ra đây — chỉ /api/ezviz/token mới phát.
      needsVerifyCode: source === "ezviz" && d.ezvizEncrypted === true && !d.ezvizVerifyCode,
      // Camera EZVIZ: online do lần đồng bộ gần nhất ghi vào ezvizOnline.
      online: source === "ezviz" ? (d.ezvizOnline ?? false) : (readyByName.get(d.code) ?? false)
    };
  });
```

Thêm `ezvizOnline: { type: Boolean }` vào schema ở Step 1 (trường này do Task 6 ghi).

`POST` hiện có: thêm `source: "rtsp"` vào `CameraModel.create({...})`.

- [ ] **Step 4: Cập nhật kiểu phía client**

Trong `src/services/camera-client.ts`, `CameraListItem` thêm:

```ts
  source: "rtsp" | "ezviz";
  ezvizSerial?: string;
  /** Camera EZVIZ bật mã hoá nhưng chưa có mã xác minh → chưa phát được. */
  needsVerifyCode?: boolean;
```

- [ ] **Step 5: Chạy toàn bộ test + build để chắc không vỡ chỗ cũ**

Run: `npx vitest run && npm run lint && npm run build`
Expected: PASS toàn bộ. Camera RTSP hiện có phải giữ nguyên hành vi.

- [ ] **Step 6: Commit**

```bash
git add src/models/camera.ts src/app/api/cameras/route.ts src/lib/aibox/mediamtx-paths.ts src/services/camera-client.ts
git commit -m "feat(camera): them truong source, cach ly camera EZVIZ khoi MediaMTX"
```

---

### Task 5: Cấu hình EZVIZ trong trang Cài đặt

**Files:**
- Create: `src/app/api/settings/ezviz/route.ts`
- Create: `src/components/settings/ezviz-setting.tsx`
- Modify: `src/components/settings-view.tsx`

**Interfaces:**
- Consumes: hằng `SETTING_KEY_EZVIZ_*` từ Task 2.
- Produces: `GET /api/settings/ezviz` → `{ ok, configured: boolean, appKey: string, areaDomain: string | null }`; `PUT` nhận `{ appKey, appSecret }`.

- [ ] **Step 1: Viết route**

```ts
// src/app/api/settings/ezviz/route.ts
// Cấu hình EZVIZ. appSecret CHỈ ghi vào, không bao giờ đọc ra client — GET
// chỉ nói "đã cấu hình hay chưa" cộng appKey (không phải bí mật).

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  SETTING_KEY_EZVIZ_APP_KEY,
  SETTING_KEY_EZVIZ_APP_SECRET,
  SETTING_KEY_EZVIZ_AREA_DOMAIN,
  SETTING_KEY_EZVIZ_TOKEN,
  SETTING_KEY_EZVIZ_TOKEN_EXPIRE_AT
} from "@/lib/aibox/ezviz-token";
import { connectMongo } from "@/lib/mongodb";
import { AppSettingModel } from "@/models/app-setting";

export const runtime = "nodejs";

export async function GET() {
  await connectMongo();
  const docs = await AppSettingModel.find({
    key: { $in: [SETTING_KEY_EZVIZ_APP_KEY, SETTING_KEY_EZVIZ_APP_SECRET, SETTING_KEY_EZVIZ_AREA_DOMAIN] }
  }).lean<{ key: string; value: string }[]>();
  const map = new Map(docs.map((d) => [d.key, d.value]));
  return NextResponse.json({
    ok: true,
    configured: Boolean(map.get(SETTING_KEY_EZVIZ_APP_KEY) && map.get(SETTING_KEY_EZVIZ_APP_SECRET)),
    appKey: map.get(SETTING_KEY_EZVIZ_APP_KEY) ?? "",
    areaDomain: map.get(SETTING_KEY_EZVIZ_AREA_DOMAIN) ?? null
  });
}

const bodySchema = z.object({
  appKey: z.string().trim().min(8, "AppKey không hợp lệ").max(128),
  appSecret: z.string().trim().min(8, "AppSecret không hợp lệ").max(128)
});

export async function PUT(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Dữ liệu không hợp lệ" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" },
      { status: 400 }
    );
  }

  await connectMongo();
  await AppSettingModel.updateOne(
    { key: SETTING_KEY_EZVIZ_APP_KEY },
    { $set: { value: parsed.data.appKey } },
    { upsert: true }
  );
  await AppSettingModel.updateOne(
    { key: SETTING_KEY_EZVIZ_APP_SECRET },
    { $set: { value: parsed.data.appSecret } },
    { upsert: true }
  );
  // Đổi key → token và region cũ vô nghĩa, xoá để lần gọi sau dò lại.
  await AppSettingModel.deleteMany({
    key: { $in: [SETTING_KEY_EZVIZ_TOKEN, SETTING_KEY_EZVIZ_TOKEN_EXPIRE_AT, SETTING_KEY_EZVIZ_AREA_DOMAIN] }
  });

  return NextResponse.json({ ok: true });
}

/** Xoá cache token + region khi ghim nhầm domain (nêu trong mục Rủi ro của spec). */
export async function DELETE() {
  await connectMongo();
  await AppSettingModel.deleteMany({
    key: { $in: [SETTING_KEY_EZVIZ_TOKEN, SETTING_KEY_EZVIZ_TOKEN_EXPIRE_AT, SETTING_KEY_EZVIZ_AREA_DOMAIN] }
  });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Viết component cấu hình**

Tạo `src/components/settings/ezviz-setting.tsx` theo đúng khuôn của `src/components/settings/box-host-setting.tsx` (đọc file đó trước rồi bám theo): 2 ô nhập `AppKey` / `AppSecret` (ô secret dùng `type="password"`, placeholder "••••" khi đã cấu hình), nút Lưu, dòng trạng thái hiện `areaDomain` đã ghim, và nút "Xoá cache token" gọi `DELETE`.

- [ ] **Step 3: Gắn vào trang Cài đặt**

Trong `src/components/settings-view.tsx`, import và render `<EzvizSetting />` ngay sau `<CameraRedirectSetting />`.

- [ ] **Step 4: Kiểm tay**

Chạy dev, mở `/settings`, nhập appKey/appSecret thật, bấm Lưu. Kiểm trong Mongo: `db.settings.find({key:/ezviz/})` phải có 2 doc. Tải lại trang → ô AppSecret hiện dạng đã che, không lộ giá trị trong response `GET`.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/settings/ezviz src/components/settings/ezviz-setting.tsx src/components/settings-view.tsx
git commit -m "feat(ezviz): cau hinh appKey/appSecret trong trang Cai dat"
```

---

### Task 6: Đồng bộ thiết bị + thêm bằng serial + nhập mã xác minh

**Files:**
- Create: `src/app/api/ezviz/sync/route.ts`
- Create: `src/app/api/ezviz/devices/route.ts`
- Create: `src/app/api/ezviz/cameras/[code]/verify-code/route.ts`
- Create: `src/services/ezviz-client.ts`
- Modify: `src/app/api/webhooks/cameras-sync/route.ts`

**Interfaces:**
- Consumes: `withTokenRetry` (Task 2), `mergeDeviceList` (Task 3), `nextCameraCode` (`src/lib/aibox/cameras.ts`), `CameraModel` (Task 4).
- Produces:
  - `syncEzvizDevices(): Promise<{ added: number; updated: number; missing: number }>` export từ `src/app/api/ezviz/sync/route.ts`? **Không** — đặt trong `src/lib/aibox/ezviz-sync.ts` để cron dùng lại mà không import route.
  - Client: `syncEzviz()`, `addEzvizDevice(input)`, `saveVerifyCode(code, verifyCode)`.

- [ ] **Step 1: Viết hàm đồng bộ dùng chung**

Tạo `src/lib/aibox/ezviz-sync.ts`:

```ts
// Đồng bộ thiết bị EZVIZ vào collection `cameras`. Dùng chung cho route thủ
// công lẫn cron, nên không nằm trong route handler.

import { postEzviz } from "@/lib/aibox/ezviz-api";
import { nextCameraCode } from "@/lib/aibox/cameras";
import {
  mergeDeviceList,
  type EzvizChannel,
  type EzvizDevice
} from "@/lib/aibox/ezviz-devices";
import { withTokenRetry } from "@/lib/aibox/ezviz-token";
import { connectMongo } from "@/lib/mongodb";
import { CameraModel } from "@/models/camera";

export interface EzvizSyncResult {
  added: number;
  updated: number;
  missing: number;
}

export async function syncEzvizDevices(): Promise<EzvizSyncResult> {
  const remote = await withTokenRetry(async ({ token, domain }) => {
    const devices = await postEzviz<EzvizDevice[]>(domain, "/api/lapp/device/list", {
      accessToken: token,
      pageStart: 0,
      pageSize: 200
    });
    const channels = await postEzviz<EzvizChannel[]>(domain, "/api/lapp/camera/list", {
      accessToken: token,
      pageStart: 0,
      pageSize: 200
    });
    return mergeDeviceList(devices ?? [], channels ?? []);
  });

  await connectMongo();
  const existing = await CameraModel.find({ source: "ezviz" }).lean<
    { code: string; ezvizSerial?: string; ezvizChannel?: number }[]
  >();
  const keyOf = (serial: string, channel: number) => `${serial}:${channel}`;
  const byKey = new Map(
    existing.map((d) => [keyOf(d.ezvizSerial ?? "", d.ezvizChannel ?? 1), d.code])
  );

  let added = 0;
  let updated = 0;
  const seen = new Set<string>();

  for (const cam of remote) {
    const key = keyOf(cam.serial, cam.channel);
    seen.add(key);
    const code = byKey.get(key);
    if (code) {
      await CameraModel.updateOne(
        { code },
        { $set: { name: cam.name, ezvizOnline: cam.online, ezvizEncrypted: cam.encrypted } }
      );
      updated += 1;
      continue;
    }
    // Mã camNN dùng chung không gian với camera RTSP để không đụng path MediaMTX.
    const codes = (await CameraModel.find({}, { code: 1 }).lean<{ code: string }[]>()).map(
      (d) => d.code
    );
    await CameraModel.create({
      code: nextCameraCode(codes),
      name: cam.name,
      source: "ezviz",
      ezvizSerial: cam.serial,
      ezvizChannel: cam.channel,
      ezvizOnline: cam.online,
      ezvizEncrypted: cam.encrypted
    });
    added += 1;
  }

  // Thiết bị biến mất khỏi tài khoản: KHÔNG xoá doc — một lần API lỗi không
  // được phép cuốn đi cấu hình người dùng. Chỉ hạ trạng thái.
  const missingCodes = existing
    .filter((d) => !seen.has(keyOf(d.ezvizSerial ?? "", d.ezvizChannel ?? 1)))
    .map((d) => d.code);
  if (missingCodes.length > 0) {
    await CameraModel.updateMany(
      { code: { $in: missingCodes } },
      { $set: { ezvizOnline: false, ezvizMissing: true } }
    );
  }

  return { added, updated, missing: missingCodes.length };
}
```

Thêm `ezvizMissing: { type: Boolean }` vào schema `camera.ts`.

- [ ] **Step 2: Ba route mỏng**

`src/app/api/ezviz/sync/route.ts` — `POST` gọi `syncEzvizDevices()`, bắt `EzvizError` → map sang thông điệp tiếng Việt theo bảng lỗi trong spec.

`src/app/api/ezviz/devices/route.ts` — `POST` nhận `{ deviceSerial, validateCode }` (zod: serial 6–32 ký tự chữ-số, validateCode 4–16), gọi `lapp/device/add`, rồi `syncEzvizDevices()`, rồi lưu `ezvizVerifyCode` cho camera vừa tạo.

`src/app/api/ezviz/cameras/[code]/verify-code/route.ts` — `PUT` nhận `{ verifyCode }`, kiểm `isValidCameraCode(code)`, lưu vào doc. Trả `{ ok: true }`.

Bảng map lỗi dùng chung — đặt trong `src/lib/aibox/ezviz-api.ts`:

```ts
/** Thông điệp tiếng Việt theo mã lỗi EZVIZ (bảng trong spec). */
export function ezvizErrorMessage(code: string): string {
  switch (code) {
    case "NOT_CONFIGURED": return "Chưa cấu hình EZVIZ trong Cài đặt";
    case "10002": return "Phiên EZVIZ hết hạn, thử lại sau giây lát";
    case "10017":
    case "10001": return "Cấu hình EZVIZ sai, kiểm tra lại trong Cài đặt";
    case "60019": return "Camera bật mã hoá — cần nhập mã xác minh";
    case "20002": return "Thiết bị không còn trong tài khoản EZVIZ";
    case "20014":
    case "20018": return "Thiết bị không thuộc tài khoản này";
    case "INVALID_RESPONSE": return "EZVIZ trả về dữ liệu không đọc được";
    default: return "Không kết nối được EZVIZ";
  }
}
```

- [ ] **Step 3: Gộp vào cron**

Trong `src/app/api/webhooks/cameras-sync/route.ts`, sau phần reconcile MediaMTX, gọi `syncEzvizDevices()` trong `try/catch` riêng — EZVIZ hỏng **không được** làm hỏng việc reconcile MediaMTX, và ngược lại. Log lỗi, vẫn trả 200.

- [ ] **Step 4: Fetcher client**

Tạo `src/services/ezviz-client.ts` theo mẫu `camera-client.ts` (hàm `readError` y hệt): `syncEzviz()`, `addEzvizDevice({ deviceSerial, validateCode })`, `saveVerifyCode(code, verifyCode)`, `fetchEzvizPlayUrl(code, kind)`.

- [ ] **Step 5: Kiểm tay trên tài khoản thật**

```bash
curl -X POST http://localhost:3000/api/ezviz/sync -b <cookie phiên đăng nhập>
```
Expected: `{"ok":true,"added":1,"updated":0,"missing":0}` ở lần đầu, lần hai `added:0, updated:1`. Kiểm Mongo: doc `cameras` mới có `source:"ezviz"`, `ezvizSerial:"BE4583385"`, `ezvizEncrypted:true`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/aibox/ezviz-sync.ts src/app/api/ezviz src/services/ezviz-client.ts src/app/api/webhooks/cameras-sync/route.ts src/models/camera.ts src/lib/aibox/ezviz-api.ts
git commit -m "feat(ezviz): dong bo thiet bi, them bang serial, luu ma xac minh"
```

---

### Task 7: Cấp URL phát cho trình duyệt (sub-account)

**Files:**
- Create: `src/app/api/ezviz/cameras/[code]/play/route.ts`
- Create: `scripts/ezviz-create-subaccount.mjs`
- Modify: `src/lib/aibox/ezviz-token.ts` (thêm `getPlayToken`)

**Interfaces:**
- Consumes: `withTokenRetry`, `buildEzopenUrl`.
- Produces: `GET /api/ezviz/cameras/[code]/play?kind=live|rec` → `{ ok, url, accessToken, expireAt }`.

**Bối cảnh:** Đây là chỗ token rời server. Spec quy định phải dùng sub-account. Sub-account chưa được kiểm chứng trên tài khoản này (`ram/account/list` trả rỗng nhưng có phản hồi hợp lệ) — vì vậy task này **bắt đầu bằng việc dò API thật**, và chỉ khi dò xong mới viết code.

- [ ] **Step 1: Dò API sub-account trên tài khoản thật**

Chạy tuần tự, lấy `accessToken` mới từ `token/get` trước:

```bash
H=https://iusopen.ezvizlife.com
curl -s -X POST "$H/api/lapp/ram/account/create" -d "accessToken=$TOKEN&accountName=dashboard&password=$(printf %s 'MatKhauManh123' | md5sum | cut -d' ' -f1)"
curl -s -X POST "$H/api/lapp/ram/policy/set" -d "accessToken=$TOKEN&accountId=$ACC&policy={\"Statement\":[{\"Permission\":\"Get,Real,Replay,PTZ\",\"Resource\":[\"dev:BE4583385\"]}]}"
curl -s -X POST "$H/api/lapp/ram/token/get" -d "accessToken=$TOKEN&accountId=$ACC"
```

Ghi lại chính xác tên tham số và hình dạng response thật vào cuối file plan này trước khi viết code.

- [ ] **Step 2: Viết script tạo sub-account**

`scripts/ezviz-create-subaccount.mjs` — đọc appKey/appSecret từ biến môi trường (`EZVIZ_APP_KEY`, `EZVIZ_APP_SECRET`), tạo account + set policy cho toàn bộ serial đang có trong Mongo, in ra `accountId` để dán vào `settings.ezvizRamAccountId`. Không hardcode bí mật.

- [ ] **Step 3: `getPlayToken` trong `ezviz-token.ts`**

```ts
/**
 * Token phát cho trình duyệt. Bắt buộc dùng sub-account: token tài khoản
 * chính có quyền trên toàn bộ tài khoản EZVIZ, lộ ra DevTools là mất trắng.
 * Chưa cấu hình sub-account thì TỪ CHỐI, không âm thầm hạ cấp bảo mật.
 */
export async function getPlayToken(): Promise<{ token: string; domain: string }> {
  const s = await readSettings([SETTING_KEY_EZVIZ_RAM_ACCOUNT_ID]);
  const accountId = s.get(SETTING_KEY_EZVIZ_RAM_ACCOUNT_ID);
  if (!accountId) {
    throw new EzvizError(
      "NO_SUBACCOUNT",
      "Chưa tạo tài khoản con EZVIZ — chạy scripts/ezviz-create-subaccount.mjs"
    );
  }
  return withTokenRetry(async ({ token, domain }) => {
    const data = await postEzviz<{ accessToken: string; expireTime: number }>(
      domain,
      "/api/lapp/ram/token/get",
      { accessToken: token, accountId }
    );
    return { token: data.accessToken, domain };
  });
}
```

Thêm `SETTING_KEY_EZVIZ_RAM_ACCOUNT_ID = "ezvizRamAccountId"` và thêm `"NO_SUBACCOUNT"` vào `ezvizErrorMessage`.

- [ ] **Step 4: Route cấp URL phát**

`GET /api/ezviz/cameras/[code]/play?kind=live|rec`: tra doc theo `code`, chặn nếu `source !== "ezviz"`, chặn nếu `ezvizEncrypted && !ezvizVerifyCode` (trả 409 + "Cần nhập mã xác minh"), dựng URL bằng `buildEzopenUrl` với `verifyCode` từ doc, kèm token từ `getPlayToken()`. `Cache-Control: no-store`.

- [ ] **Step 5: Kiểm tay**

```bash
curl -s "http://localhost:3000/api/ezviz/cameras/cam02/play?kind=live" -b <cookie>
```
Expected: `{"ok":true,"url":"ezopen://…@open.ezviz.com/BE4583385/1.hd.live","accessToken":"…"}`. Chưa có sub-account → 409 kèm thông điệp hướng dẫn chạy script.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/ezviz/cameras src/lib/aibox/ezviz-token.ts scripts/ezviz-create-subaccount.mjs
git commit -m "feat(ezviz): cap URL phat qua tai khoan con"
```

---

### Task 8: PTZ

**Files:**
- Create: `src/app/api/ezviz/cameras/[code]/ptz/route.ts`
- Create: `src/components/camera/ptz-pad.tsx`

**Interfaces:**
- Consumes: `withTokenRetry`, `CameraModel`.
- Produces: `POST /api/ezviz/cameras/[code]/ptz` body `{ direction: 0|1|2|3|8|9, speed: 0|1|2, action: "start"|"stop" }`.

Hướng EZVIZ: `0` lên, `1` xuống, `2` trái, `3` phải, `8` zoom in, `9` zoom out.

- [ ] **Step 1: Viết route**

Zod validate body, tra `ezvizSerial`/`ezvizChannel` theo `code`, gọi `lapp/device/ptz/start` hoặc `/stop` với `{ accessToken, deviceSerial, channelNo, direction, speed }`. Lệnh `stop` **không** cần `speed`.

- [ ] **Step 2: Viết `PtzPad`**

```tsx
// Cụm điều khiển PTZ. Quy tắc sống còn: mọi đường thoát khỏi trạng thái
// "đang giữ" đều phải gửi stop — nhả chuột, chuột rời nút, component unmount,
// tab ẩn đi. Thiếu một nhánh là camera quay mãi.
```

Dùng `onPointerDown` → start, `onPointerUp` / `onPointerLeave` / `onPointerCancel` → stop, và `useEffect` cleanup gửi stop nếu đang giữ. Gửi `keepalive: true` cho request stop lúc unmount.

- [ ] **Step 3: Kiểm tay trên camera thật**

Mở single view camera EZVIZ, giữ nút trái ~1 giây rồi nhả. Camera phải **xoay rồi dừng hẳn**. Thử: giữ nút rồi kéo chuột ra ngoài nút — camera vẫn phải dừng. Thử: giữ nút rồi đóng tab — camera phải dừng.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/ezviz/cameras/[code]/ptz src/components/camera/ptz-pad.tsx
git commit -m "feat(ezviz): dieu khien PTZ"
```

---

### Task 9: Player EZUIKit + gắn vào lưới và tab Xem lại

**Files:**
- Modify: `package.json` (thêm `ezuikit-js`)
- Create: `src/components/camera/ezviz-player.tsx`
- Create: `src/components/camera/ezviz-verify-code-dialog.tsx`
- Modify: `src/components/camera/camera-grid.tsx`
- Modify: `src/components/camera/camera-single-view.tsx`
- Modify: `src/components/camera/camera-view.tsx`
- Create: `src/app/api/ezviz/cameras/[code]/playback/route.ts`

**Interfaces:**
- Consumes: `fetchEzvizPlayUrl` (Task 6), `PtzPad` (Task 8).
- Produces: `<EzvizPlayer code kind />`, `GET /api/ezviz/cameras/[code]/playback?from&to` → `{ ok, ranges: { start: string; end: string }[] }`.

- [ ] **Step 1: Cài thư viện, ghim phiên bản**

```bash
npm install --save-exact ezuikit-js
```

- [ ] **Step 2: Viết `EzvizPlayer`**

Client component. `next/dynamic` với `ssr: false` (EZUIKit đụng `window` lúc import). Gọi `fetchEzvizPlayUrl(code, kind)`, khởi tạo `EZUIKitPlayer` trong `useEffect`, **destroy trong cleanup** (không destroy → nhiều WebSocket sống song song khi chuyển tab). Lỗi 409 "cần mã xác minh" → render nút mở `EzvizVerifyCodeDialog` thay vì player.

- [ ] **Step 3: Lưới rẽ nhánh theo `source`**

Trong `camera-grid.tsx`, `GridTile` chọn player:

```tsx
  // Camera EZVIZ không có URL MediaMTX — useLiveUrls sẽ 404. Rẽ nhánh trước.
  if (cam.source === "ezviz") {
    return <EzvizPlayer code={cam.code} kind="live" />;
  }
```

Quan trọng: **không** gọi `useLiveUrls` cho camera EZVIZ. Vì hook không được gọi có điều kiện, tách `GridTile` thành `RtspTile` và `EzvizTile`, `GridTile` chỉ chọn giữa hai.

- [ ] **Step 4: Single view + PTZ**

`camera-single-view.tsx`: camera EZVIZ render `<EzvizPlayer kind="live" />` + `<PtzPad code={cam.code} />`; camera RTSP giữ nguyên WebRTC.

- [ ] **Step 5: Tab Xem lại rẽ nhánh**

`camera-view.tsx`, tab `playback`: camera `source === "ezviz"` render `<EzvizPlayer kind="rec" />`; còn lại giữ `PlaybackView`. Route `playback` trả các khoảng có clip bằng `lapp/video/by/time` với `recType=2` và epoch ms, dùng để hiện ngày nào xem được.

- [ ] **Step 6: Kiểm tay đầy đủ**

- Lưới: camera EZVIZ lên hình cạnh camera RTSP.
- Camera EZVIZ chưa nhập mã xác minh → hiện nút "Nhập mã xác minh", nhập xong phát được.
- Bấm tile → single view có PTZ, xoay và dừng đúng.
- Tab Xem lại → chọn camera EZVIZ → phát được clip cloud.
- Chuyển qua lại giữa các tab 5 lần, mở DevTools → Network → WS: số kết nối **không** tăng dồn.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/components/camera src/app/api/ezviz
git commit -m "feat(ezviz): player EZUIKit cho truc tiep va xem lai"
```

---

### Task 10: Tài liệu + hiện lại mục nav Camera

**Files:**
- Create: `docs/ezviz-integration.md`
- Modify: `src/components/shell/nav-config.ts`
- Modify: `docs/camera-management-dev.md`

- [ ] **Step 1: Viết `docs/ezviz-integration.md`**

Gồm: cách lấy appKey/appSecret, nhập vào Cài đặt, chạy script tạo sub-account, thêm camera (app EZVIZ hoặc form serial), nhập mã xác minh, và bảng lỗi thường gặp. Ghi rõ camera EZVIZ **không** ghi hình về server.

- [ ] **Step 2: Bật lại mục nav Camera**

`nav-config.ts` đang comment mục "Camera trực tiếp" (commit `81d354c`). Bỏ comment mục nav + import `Video`. Ghi chú trong `docs/camera-management-dev.md` rằng MediaMTX trên server hiện **tắt** nên tab Trực tiếp chỉ có camera EZVIZ; camera RTSP sẽ hiện offline.

- [ ] **Step 3: Kiểm build**

Run: `npx vitest run && npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add docs/ezviz-integration.md docs/camera-management-dev.md src/components/shell/nav-config.ts
git commit -m "docs(ezviz): huong dan tich hop + hien lai muc nav Camera"
```

---

### Task 11: Deploy

**Files:** không sửa code.

**Điều kiện tiên quyết:** xác nhận với người dùng server đích trước khi chạy. Mặc định hiểu là `222.255.181.96` (`aibox.zootech.asia`), **không** bật lại MediaMTX ở đó.

- [ ] **Step 1: Merge và push**

```bash
git checkout main && git merge --no-ff feat/ezviz-integration && git push origin main
```

- [ ] **Step 2: Deploy**

```bash
ssh 222.255.181.96 'cd /root/dashboard-ai-box && git pull && export NVM_DIR=$HOME/.nvm && . $NVM_DIR/nvm.sh && nvm use 22 && npm ci && npm run build && pm2 restart dashboard-ai-box'
```

- [ ] **Step 3: Cấu hình trên production**

Mở `https://aibox.zootech.asia/settings`, nhập appKey/appSecret. Chạy script tạo sub-account trên server. Bấm Đồng bộ EZVIZ.

- [ ] **Step 4: Xác minh trên production**

- `/camera` tab Trực tiếp: camera EZVIZ lên hình qua HTTPS.
- PTZ xoay và dừng.
- Tab Xem lại phát được clip.
- `pm2 logs dashboard-ai-box --lines 50` không có lỗi lặp.

- [ ] **Step 5: Nhắc người dùng reset AppSecret** trên console EZVIZ, rồi nhập lại giá trị mới vào Cài đặt.

---

## Ghi chú kết quả dò API (điền ở Task 7 Step 1)

<!-- Người thực thi Task 7 điền tên tham số và hình dạng response thật của
     ram/account/create, ram/policy/set, ram/token/get vào đây trước khi viết code. -->

## Câu hỏi còn treo

- Camera EZVIZ có nên chiếm ô cố định trong lưới NVR như camera RTSP không, hay chỉ hiện khi đã có mã xác minh? Plan hiện làm theo hướng **luôn hiện**, chưa có mã thì hiện nút nhập.
- Nếu API sub-account không dùng được trên tài khoản này (phát hiện ở Task 7 Step 1), cần quyết: dừng lại chờ mở quyền, hay tạm cấp token chính sau một cờ môi trường rõ ràng.
