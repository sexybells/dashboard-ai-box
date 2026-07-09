# AI-Box Dashboard Vietnamese Redesign Design

## Goal

Redesign the AI-Box alarm application so the dashboard and alarm detail page feel modern, operational, realtime, and fully Vietnamese. The redesign must keep existing webhook, alarm list, polling, and SSE realtime behavior intact.

## Scope

This change covers the full visible app surface:

- Dashboard at `/`
- Alarm detail page at `/alarms/[id]`
- Loading, empty, error, and filtered states
- Buttons, metrics, filters, tables, thumbnails, status pills, and raw JSON display

This change does not alter:

- Webhook contract
- API response shape
- MongoDB schema
- Realtime SSE endpoint behavior
- Production deployment configuration

## Recommended Approach

Use an operations-focused dashboard design. The UI should be dense enough for repeated monitoring, but visually cleaner and more polished than the current version.

Rejected alternatives:

- A command-center style would look more dramatic, but would add visual weight and reduce day-to-day scan efficiency.
- A minimal admin style would be easy to maintain, but would not communicate realtime monitoring clearly enough.

## User Experience

The app should open directly into the usable dashboard, not a landing page. The first viewport should show:

- Vietnamese product context: `Bảng điều khiển cảnh báo AI Box`
- Realtime connection state
- Refresh action
- Webhook listener URL with copy action
- Key metrics
- Filters and recent alarms

Vietnamese copy should be direct and operational:

- `Giám sát thời gian thực`
- `URL nhận cảnh báo`
- `Làm mới`
- `Sao chép`
- `Tổng cảnh báo`
- `Theo bộ lọc`
- `Đang hiển thị`
- `Cập nhật lần cuối`
- `Kết nối realtime`
- `Đang trực tuyến`
- `Mất kết nối`
- `Đang kết nối`
- `Cảnh báo gần đây`
- `Chi tiết`
- `Chưa có cảnh báo. Hãy cấu hình AI Box gửi callback về URL bên trên.`

The detail page should use Vietnamese labels such as:

- `Ảnh cảnh báo`
- `Thông tin cảnh báo`
- `Tác vụ`
- `Tóm tắt`
- `Mô tả`
- `Camera`
- `IP thiết bị`
- `Mã cảnh báo`
- `Mã định danh`
- `Thời gian`
- `Thuộc tính kết quả`
- `Dữ liệu gốc JSON`

## Visual Design

Use a neutral operations palette with measured accents:

- Background: soft neutral off-white
- Text: charcoal
- Primary accent: blue or teal for realtime and actions
- Success: green
- Warning: amber
- Critical/attention: rose or red

Avoid a one-note palette, oversized marketing composition, decorative blobs, and nested cards. Cards should remain practical and use a border radius of 8px or less.

Dashboard layout:

- Top header band with title, status pill, and refresh button
- Webhook URL band with monospace URL and copy action
- Metric grid with stable card dimensions
- Filter toolbar with responsive controls
- Recent alarms table/list with fixed thumbnail area and stable row height

Detail layout:

- Main alarm image area
- Metadata panel
- Result properties table
- Raw JSON block

All UI must remain responsive. Text must not overflow buttons, filters, table cells, or cards on mobile or desktop.

## Component Plan

Keep the existing data flow and split only where it improves readability:

- `alarm-dashboard.tsx` remains the dashboard container for data loading, polling, SSE subscription, filters, and state transitions.
- Add small typed presentational helpers only if needed for metrics, status pills, filters, table rows, or empty states.
- `alarm-detail.tsx` keeps its data contract and switches display copy/layout to Vietnamese.
- `globals.css` owns the visual redesign with existing global CSS style, without introducing a new UI library.

No new icon dependency is required for this pass.

## Data Flow

Dashboard data flow stays the same:

1. Initial alarm list loads from `/api/alarms`.
2. Filters derive visible rows locally.
3. Polling continues as a fallback.
4. `EventSource` listens to `/api/alarms/stream`.
5. `alarm-created` events merge new alarms into local state and highlight fresh rows.

The redesign must not change serialization, ingest, or publish behavior.

## States

The UI must explicitly handle:

- Initial loading
- Refresh in progress
- API error with retry via refresh
- No alarms in the database
- No results after filters
- Realtime connected, connecting, and disconnected
- Alarm rows with and without local image
- Detail page with missing optional fields
- Detail page with no `Result.Properties`

## Accessibility

Use semantic controls for buttons, inputs, selects, and tables. Keep focus states visible. Copy buttons and refresh buttons must have clear labels. Color should support status recognition, but status text must remain present.

## Verification

Before completion:

- Run the unit test suite.
- Run lint.
- Run production build.
- Start the local dev server.
- Visually inspect desktop and mobile widths.
- Confirm dashboard still receives realtime updates through the existing SSE behavior when an alarm event arrives.

## Out of Scope

- Deploying to production unless explicitly requested after local verification.
- Adding authentication or user roles.
- Changing webhook security or endpoint names.
- Creating mock data seed flows.
- Replacing the backend or database layer.
