# AI Box Dashboard

Dashboard local de nhan webhook alarm tu AI Box, luu MongoDB, hien thi realtime qua Server-Sent Events va hien thi anh `ImageData` neu AI Box gui base64.

## Chay local

Yeu cau:

- Node.js `>=20.19`
- MongoDB dang chay tren may local
- AI Box ping duoc IP cua may dang chay dashboard

Thu muc project:

```bash
cd /Users/duongnguyenhai/Work/AiBoxDashboard
```

Cau hinh MongoDB da co san trong `.env.local`:

```bash
MONGODB_URI=mongodb://127.0.0.1:27017/aibox_dashboard
```

Chay dashboard cho LAN:

```bash
npm run dev:lan
```

Neu Next dung port mac dinh, dashboard se o:

```text
http://0.0.0.0:3000
```

Tu may Mac, mo:

```text
http://localhost:3000
```

Tu AI Box, URL can cau hinh vao task la IP LAN cua may Mac, vi du:

```text
http://192.168.88.134:3000/api/webhooks/aibox
```

Luu y: AI Box cua ban dang la `192.168.1.26`. Neu may Mac la `192.168.88.134` thi hai thiet bi khac subnet. AI Box chi gui duoc callback local neu routing/gateway cho phep di tu `192.168.1.26` sang `192.168.88.134`, hoac ban dua chung ve cung mot mang.

## Endpoint

- `POST /api/webhooks/aibox`: nhan callback alarm tu AI Box.
- `GET /api/alarms`: lay danh sach alarm, co filter `q`, `taskSession`, `summary`, `description`, `mediaName`, `from`, `to`.
- `GET /api/alarms/stream`: realtime stream cho dashboard bang Server-Sent Events.
- `GET /api/alarms/:id`: xem chi tiet mot alarm.
- `GET /api/alarm-images/:filename`: doc anh base64 da luu local.

Anh base64 duoc luu trong:

```text
storage/alarm-images
```

## Test nhanh webhook

Khi server dang chay va MongoDB dang bat:

```bash
curl -X POST http://localhost:3000/api/webhooks/aibox \
  -H 'Content-Type: application/json' \
  -d '{"AlarmId":"demo-1","TaskSession":"gate-in","Summary":"People Counting","ImageData":"/9j/4AAQSkZJRgABAQAAAQABAAD/2w==","Timestamp":"2026-07-08T09:00:00.000Z"}'
```

Dashboard dang mo se cap nhat ngay khi webhook tao alarm moi. Trang van co refresh dinh ky 30 giay lam fallback neu ket noi realtime bi ngat.

## Cau hinh tren AI Box

Vao task da duoc `Permitted`, tim truong `Alarm Listener URL` / `MetadataUrl`, nhap:

```text
http://<IP-LAN-CUA-MAY-MAC>:3000/api/webhooks/aibox
```

Khong dung `localhost` trong AI Box, vi `localhost` se tro ve chinh AI Box. Cung khong dung `webhook.site` khi AI Box khong co gateway ra Internet.

## Deploy public free

Huong dan deploy len Render Free + MongoDB Atlas Free nam o:

```text
docs/deploy-render.md
```
