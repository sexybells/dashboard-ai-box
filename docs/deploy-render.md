# Deploy free len Render + MongoDB Atlas

Huong nay phu hop de test webhook public cho AI Box ma khong can cung LAN.

## 1. Tao MongoDB Atlas Free

1. Vao MongoDB Atlas va tao Free cluster M0.
2. Tao database user.
3. Network Access: cho phep Render ket noi. De test nhanh co the them `0.0.0.0/0`, sau do sieu chat lai khi biet outbound IP.
4. Lay connection string dang:

```text
mongodb+srv://<user>:<password>@<cluster-host>/aibox_dashboard?retryWrites=true&w=majority
```

Khong commit connection string vao git.

## 2. Dua source len GitHub

Render Free deploy tot nhat tu GitHub repo.

Neu thu muc nay chua la git repo:

```bash
cd /Users/duongnguyenhai/Work/AiBoxDashboard
git init
git add .
git commit -m "Prepare AI Box dashboard deployment"
```

Sau do tao repo tren GitHub va push source len.

## 3. Tao Web Service tren Render

1. Vao Render Dashboard.
2. New -> Web Service.
3. Connect GitHub repo `AiBoxDashboard`.
4. Render se doc `render.yaml`.
5. Set environment variable:

```text
MONGODB_URI=<MongoDB Atlas connection string>
```

6. Deploy.

Sau deploy, Render se cap URL dang:

```text
https://aibox-dashboard.onrender.com
```

Webhook URL cho AI Box:

```text
https://aibox-dashboard.onrender.com/api/webhooks/aibox
```

## 4. Cau hinh AI Box

Trong task `Permitted`, truong `Alarm Listener URL` / `MetadataUrl`:

```text
https://<render-service>.onrender.com/api/webhooks/aibox
```

Khong them khoang trang dau/cuoi URL.

## 5. Gioi han cua free host

Render Free co the sleep sau mot thoi gian idle. Request webhook dau tien sau khi sleep co the cham. Neu AI Box timeout khi Render dang wake up, trigger lai alarm hoac dung host tra phi.

Render Free filesystem la ephemeral. Project da co fallback: neu file anh local bi mat sau restart, route anh se doc lai base64 tu MongoDB khi payload co `ImageData` base64.

MongoDB Atlas Free cluster khong het han, nhung chi nen dung cho dev/test hoac proof-of-concept.
