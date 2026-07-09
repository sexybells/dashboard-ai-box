# AI-Box Dashboard Vietnamese Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the AI-Box dashboard and alarm detail page into a modern Vietnamese realtime operations UI.

**Architecture:** Keep the existing Next.js App Router, client dashboard state, polling, SSE subscription, and MongoDB-backed detail route. Add a small display helper module for shared Vietnamese labels/date formatting, then update the dashboard, detail page, and global CSS presentation without changing API contracts.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, global CSS, Vitest.

## Global Constraints

- Keep webhook contract unchanged.
- Keep API response shape unchanged.
- Keep MongoDB schema unchanged.
- Keep realtime SSE endpoint behavior unchanged.
- Do not introduce a new UI library.
- Do not add a new icon dependency.
- Use Vietnamese copy across the visible dashboard and detail page.
- Keep cards practical with border radius of 8px or less.
- Avoid decorative blobs, nested cards, oversized marketing composition, and one-note palette.
- Deploying to production is out of scope unless explicitly requested after local verification.

---

## File Structure

- Create `src/components/alarm-display.ts`: shared Vietnamese display helpers for date formatting, realtime status labels, empty-state copy, and detail fallback text.
- Create `src/components/alarm-display.test.ts`: Vitest coverage for helper output used by UI components.
- Modify `src/components/alarm-dashboard.tsx`: use the display helpers, replace English copy, add operational header/status/metrics/filter/table structure, and keep realtime state flow unchanged.
- Modify `src/components/alarm-detail.tsx`: replace English copy, improve detail layout semantics, and use Vietnamese fallbacks.
- Modify `src/app/alarms/[id]/page.tsx`: localize the detail route header and back action.
- Modify `src/app/globals.css`: implement the modern responsive visual design with stable table, cards, controls, detail image, empty/error states, and realtime highlight styling.

---

### Task 1: Shared Vietnamese Display Helpers

**Files:**
- Create: `src/components/alarm-display.ts`
- Create: `src/components/alarm-display.test.ts`

**Interfaces:**
- Produces: `type RealtimeStatus = "connecting" | "live" | "offline"`
- Produces: `formatAlarmDate(value?: string): string`
- Produces: `getRealtimeStatusLabel(status: RealtimeStatus): string`
- Produces: `getAlarmListEmptyMessage(hasActiveFilters: boolean): string`
- Produces: `formatUnknown(value?: string | number | null): string`

- [ ] **Step 1: Write the failing helper tests**

Create `src/components/alarm-display.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  formatAlarmDate,
  formatUnknown,
  getAlarmListEmptyMessage,
  getRealtimeStatusLabel
} from "./alarm-display";

describe("alarm display helpers", () => {
  it("formats valid alarm dates with Vietnamese locale", () => {
    expect(formatAlarmDate("2026-07-09T03:04:05.000Z")).toMatch(/09\/07\/2026/);
  });

  it("keeps invalid dates readable", () => {
    expect(formatAlarmDate("camera-time-text")).toBe("camera-time-text");
  });

  it("uses a dash for missing dates and unknown values", () => {
    expect(formatAlarmDate()).toBe("-");
    expect(formatUnknown()).toBe("-");
    expect(formatUnknown(null)).toBe("-");
  });

  it("returns Vietnamese realtime status labels", () => {
    expect(getRealtimeStatusLabel("live")).toBe("Đang trực tuyến");
    expect(getRealtimeStatusLabel("offline")).toBe("Mất kết nối");
    expect(getRealtimeStatusLabel("connecting")).toBe("Đang kết nối");
  });

  it("returns distinct empty-state messages for database and filters", () => {
    expect(getAlarmListEmptyMessage(false)).toContain("Chưa có cảnh báo");
    expect(getAlarmListEmptyMessage(true)).toContain("Không có cảnh báo phù hợp");
  });
});
```

- [ ] **Step 2: Run the failing helper tests**

Run: `npm run test -- src/components/alarm-display.test.ts`

Expected: FAIL because `src/components/alarm-display.ts` does not exist yet.

- [ ] **Step 3: Implement the display helpers**

Create `src/components/alarm-display.ts`:

```ts
export type RealtimeStatus = "connecting" | "live" | "offline";

export function formatAlarmDate(value?: string): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(date);
}

export function getRealtimeStatusLabel(status: RealtimeStatus): string {
  if (status === "live") return "Đang trực tuyến";
  if (status === "offline") return "Mất kết nối";
  return "Đang kết nối";
}

export function getAlarmListEmptyMessage(hasActiveFilters: boolean): string {
  if (hasActiveFilters) {
    return "Không có cảnh báo phù hợp với bộ lọc hiện tại.";
  }
  return "Chưa có cảnh báo. Hãy cấu hình AI Box gửi callback về URL bên trên.";
}

export function formatUnknown(value?: string | number | null): string {
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof value === "number") return String(value);
  return "-";
}
```

- [ ] **Step 4: Verify helper tests pass**

Run: `npm run test -- src/components/alarm-display.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit helper task**

```bash
git add src/components/alarm-display.ts src/components/alarm-display.test.ts
git commit -m "Add Vietnamese alarm display helpers"
```

---

### Task 2: Dashboard Vietnamese Realtime UI

**Files:**
- Modify: `src/components/alarm-dashboard.tsx`

**Interfaces:**
- Consumes: `formatAlarmDate(value?: string): string`
- Consumes: `getRealtimeStatusLabel(status: RealtimeStatus): string`
- Consumes: `getAlarmListEmptyMessage(hasActiveFilters: boolean): string`
- Consumes: `RealtimeStatus`
- Produces: Updated dashboard markup and Vietnamese copy while preserving `loadAlarms`, polling, SSE `EventSource`, `mergeRealtimeAlarm`, and filter state.

- [ ] **Step 1: Import display helpers and remove local date/status helpers**

In `src/components/alarm-dashboard.tsx`, replace the local `RealtimeStatus` type and `formatDate` function with imports:

```ts
import {
  formatAlarmDate,
  getAlarmListEmptyMessage,
  getRealtimeStatusLabel,
  type RealtimeStatus
} from "@/components/alarm-display";
```

Keep `uniqueValues`, `emptyResponse`, `loadAlarms`, and both `useEffect` blocks unchanged except for copy and helper usage.

- [ ] **Step 2: Add derived dashboard flags**

Inside `AlarmDashboard`, after `const cameras = uniqueValues(data.data, "mediaName");`, add:

```ts
const realtimeLabel = getRealtimeStatusLabel(realtimeStatus);
const hasActiveFilters = Boolean(filters.q || filters.taskSession || filters.summary || filters.mediaName);
const rowCountLabel = `${data.data.length.toLocaleString("vi-VN")} dòng`;
```

- [ ] **Step 3: Replace header and webhook copy**

Use this header structure:

```tsx
<div className="page-header dashboard-header">
  <div>
    <p className="eyebrow">Giám sát thời gian thực</p>
    <h1>Bảng điều khiển cảnh báo AI Box</h1>
  </div>
  <div className="header-actions">
    <span className={`status-pill ${realtimeStatus}`}>{realtimeLabel}</span>
    <button className="button" type="button" onClick={() => void loadAlarms()}>
      Làm mới
    </button>
  </div>
</div>

<section className="webhook-banner">
  <div>
    <span>URL nhận cảnh báo</span>
    <strong>{webhookUrl}</strong>
  </div>
  <button className="button secondary" type="button" onClick={() => navigator.clipboard.writeText(webhookUrl)}>
    Sao chép
  </button>
</section>
```

- [ ] **Step 4: Replace metric cards with Vietnamese labels**

Use the same data values and these labels:

```tsx
<section className="metric-grid">
  <div className="metric">
    <span>Tổng cảnh báo</span>
    <strong>{data.allTotal.toLocaleString("vi-VN")}</strong>
  </div>
  <div className="metric">
    <span>Theo bộ lọc</span>
    <strong>{data.total.toLocaleString("vi-VN")}</strong>
  </div>
  <div className="metric">
    <span>Đang hiển thị</span>
    <strong>{data.data.length.toLocaleString("vi-VN")}</strong>
  </div>
  <div className="metric">
    <span>Cập nhật lần cuối</span>
    <strong>{lastUpdated ? formatAlarmDate(lastUpdated.toISOString()) : "-"}</strong>
  </div>
  <div className="metric">
    <span>Kết nối realtime</span>
    <strong className={`status-text ${realtimeStatus}`}>{realtimeLabel}</strong>
  </div>
</section>
```

- [ ] **Step 5: Replace filter labels and options**

Use Vietnamese labels and placeholders:

```tsx
<label>
  Tìm kiếm
  <input
    value={filters.q}
    onChange={(event) => setFilters((current) => ({ ...current, q: event.target.value }))}
    placeholder="Mã cảnh báo, tác vụ, camera..."
  />
</label>
```

Use these select labels/options:

```tsx
<label>Tác vụ ... <option value="">Tất cả tác vụ</option></label>
<label>Loại cảnh báo ... <option value="">Tất cả loại cảnh báo</option></label>
<label>Camera ... <option value="">Tất cả camera</option></label>
```

- [ ] **Step 6: Replace table heading, row labels, and empty state**

Use:

```tsx
<h2>Cảnh báo gần đây</h2>
{newAlarmCount > 0 ? (
  <span className="new-alarm-badge">
    {newAlarmCount.toLocaleString("vi-VN")} cảnh báo mới
  </span>
) : null}
{isLoading ? <span>Đang tải...</span> : <span>{rowCountLabel}</span>}
```

Use table headers:

```tsx
<th>Ảnh</th>
<th>Tác vụ</th>
<th>Camera</th>
<th>Cảnh báo</th>
<th>Thời gian</th>
<th />
```

Use row copy:

```tsx
alt={alarm.summary || "Cảnh báo AI Box"}
{formatAlarmDate(alarm.time || alarm.timeText)}
<Link className="text-link" href={`/alarms/${alarm.id}`}>Chi tiết</Link>
```

Use empty state:

```tsx
<div className="empty-state">{getAlarmListEmptyMessage(hasActiveFilters)}</div>
```

- [ ] **Step 7: Verify dashboard compiles**

Run: `npm run test -- src/components/alarm-display.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit dashboard task**

```bash
git add src/components/alarm-dashboard.tsx
git commit -m "Localize realtime dashboard UI"
```

---

### Task 3: Vietnamese Alarm Detail Page

**Files:**
- Modify: `src/components/alarm-detail.tsx`
- Modify: `src/app/alarms/[id]/page.tsx`

**Interfaces:**
- Consumes: `formatUnknown(value?: string | number | null): string`
- Produces: Vietnamese alarm detail labels, fallback messages, route header, and back link without changing the alarm prop contract.

- [ ] **Step 1: Update detail component imports and row helper**

In `src/components/alarm-detail.tsx`, add:

```ts
import { formatUnknown } from "@/components/alarm-display";
```

Change `row` to:

```tsx
function row(label: string, value?: unknown) {
  return (
    <div className="detail-row">
      <span>{label}</span>
      <strong>{typeof value === "string" || typeof value === "number" ? formatUnknown(value) : "-"}</strong>
    </div>
  );
}
```

- [ ] **Step 2: Localize image and metadata copy**

Use:

```tsx
alt={alarm.summary || "Cảnh báo AI Box"}
<div className="empty-state">Không có ảnh cục bộ. Nguồn: {alarm.imageOriginal || alarm.imageKind || "không có"}</div>
<h2>Thông tin cảnh báo</h2>
{row("Tác vụ", alarm.taskSession)}
{row("Tóm tắt", alarm.summary)}
{row("Mô tả", alarm.description)}
{row("Camera", alarm.mediaName)}
{row("IP thiết bị", alarm.boardIp)}
{row("Mã cảnh báo", alarm.alarmId)}
{row("Mã định danh", alarm.uniqueId)}
{row("Thời gian", alarm.timeText || alarm.time)}
```

- [ ] **Step 3: Localize properties and raw JSON copy**

Use:

```tsx
<h2>Thuộc tính kết quả</h2>
<span>{properties.length.toLocaleString("vi-VN")} mục</span>
<span>{property.desc || property.property || "Thuộc tính"}</span>
<div className="empty-state">Payload không có Result.Properties.</div>
<h2>Dữ liệu gốc JSON</h2>
```

- [ ] **Step 4: Localize detail route header**

In `src/app/alarms/[id]/page.tsx`, use:

```tsx
<p className="eyebrow">Chi tiết cảnh báo</p>
<h1>{alarm.taskSession || alarm.summary || "Cảnh báo AI Box"}</h1>
<Link className="button secondary" href="/">Quay lại</Link>
```

- [ ] **Step 5: Verify detail changes compile through tests**

Run: `npm run test -- src/components/alarm-display.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit detail task**

```bash
git add src/components/alarm-detail.tsx src/app/alarms/[id]/page.tsx
git commit -m "Localize alarm detail page"
```

---

### Task 4: Modern Responsive Styling and Final Verification

**Files:**
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: class names already used by `alarm-dashboard.tsx` and `alarm-detail.tsx`
- Produces: responsive, modern Vietnamese operations UI with stable dimensions and visible states.

- [ ] **Step 1: Replace color tokens and base layout**

Update `:root`, `body`, `.page-shell`, `.page-header`, `.dashboard-header`, and `.header-actions` to use neutral background, charcoal text, measured blue/teal/amber/rose accents, and stable header wrapping.

- [ ] **Step 2: Style buttons, status pills, webhook band, and metrics**

Ensure:

- `.button` stays 7px radius and does not overflow long Vietnamese labels.
- `.status-pill.live`, `.status-pill.connecting`, and `.status-pill.offline` include visible text color and border/background.
- `.webhook-banner strong` wraps long URLs with `overflow-wrap: anywhere`.
- `.metric` has stable min height and `.metric strong` uses compact dashboard-scale type.

- [ ] **Step 3: Style filters and tables**

Ensure:

- `.filter-grid` uses responsive grid tracks.
- Inputs/selects keep readable focus states.
- `.table-panel`, `.table-wrap`, `table`, `th`, and `td` maintain scan-friendly density.
- `.thumb` keeps fixed `88px x 64px`.
- `.new-alarm-row td` retains the realtime highlight animation.
- `.empty-state` and `.alert` are visually distinct and Vietnamese copy fits.

- [ ] **Step 4: Style detail page**

Ensure:

- `.detail-grid` uses image + metadata columns on desktop and one column on mobile.
- `.image-preview` has stable min height and no image cropping.
- `.detail-row` and `.property-item` wrap long IDs, URLs, and JSON values.
- `pre` remains readable and scrollable.

- [ ] **Step 5: Run full automated verification**

Run:

```bash
npm run test
npm run lint
npm run build
```

Expected: all commands pass.

- [ ] **Step 6: Start local dev server**

Run: `npm run dev`

Expected: Next.js dev server starts and prints a local URL, usually `http://localhost:3000`.

- [ ] **Step 7: Visually inspect desktop and mobile**

Open the local URL and verify:

- Dashboard is Vietnamese.
- Realtime status pill is visible.
- Webhook URL band wraps correctly.
- Metrics, filters, table rows, and detail page do not overlap at desktop width.
- At mobile width, header actions, filters, table, and detail page stack without clipped labels.

- [ ] **Step 8: Commit styling task**

```bash
git add src/app/globals.css
git commit -m "Modernize Vietnamese dashboard styling"
```

---

## Final Review

- [ ] Run `git status --short` and confirm only expected files are changed or committed.
- [ ] Confirm no English dashboard/detail UI copy remains with `rg -n "AI Box Alarm Dashboard|Alarm Listener URL|Refresh|Copy|Recent alarms|Detail|Metadata|Raw JSON|No local image|No alarms yet|Loading|Offline|Connecting|Live" src`.
- [ ] Confirm no unintended generated Next.js type churn remains in `next-env.d.ts`.
- [ ] Report local dev URL and verification results to the user.
