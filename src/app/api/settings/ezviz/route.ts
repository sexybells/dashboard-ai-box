// Cấu hình EZVIZ. appSecret CHỈ ghi vào, không bao giờ đọc ra client — GET
// chỉ nói "đã cấu hình hay chưa" cộng appKey (không phải bí mật).

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  SETTING_KEY_EZVIZ_ALLOW_MAIN_TOKEN,
  SETTING_KEY_EZVIZ_APP_KEY,
  SETTING_KEY_EZVIZ_APP_SECRET,
  SETTING_KEY_EZVIZ_AREA_DOMAIN,
  SETTING_KEY_EZVIZ_RAM_ACCOUNT_ID,
  SETTING_KEY_EZVIZ_TOKEN,
  SETTING_KEY_EZVIZ_TOKEN_EXPIRE_AT
} from "@/lib/aibox/ezviz-token";
import { connectMongo } from "@/lib/mongodb";
import { AppSettingModel } from "@/models/app-setting";

export const runtime = "nodejs";

/** Token + region là dẫn xuất của cặp key — đổi key thì phải bỏ hết. */
const DERIVED_KEYS = [
  SETTING_KEY_EZVIZ_TOKEN,
  SETTING_KEY_EZVIZ_TOKEN_EXPIRE_AT,
  SETTING_KEY_EZVIZ_AREA_DOMAIN
];

export async function GET() {
  await connectMongo();
  const docs = await AppSettingModel.find({
    key: {
      $in: [
        SETTING_KEY_EZVIZ_APP_KEY,
        SETTING_KEY_EZVIZ_APP_SECRET,
        SETTING_KEY_EZVIZ_AREA_DOMAIN,
        SETTING_KEY_EZVIZ_RAM_ACCOUNT_ID,
        SETTING_KEY_EZVIZ_ALLOW_MAIN_TOKEN
      ]
    }
  }).lean<{ key: string; value: string }[]>();
  const map = new Map(docs.map((d) => [d.key, d.value]));

  return NextResponse.json({
    ok: true,
    configured: Boolean(map.get(SETTING_KEY_EZVIZ_APP_KEY) && map.get(SETTING_KEY_EZVIZ_APP_SECRET)),
    appKey: map.get(SETTING_KEY_EZVIZ_APP_KEY) ?? "",
    areaDomain: map.get(SETTING_KEY_EZVIZ_AREA_DOMAIN) ?? null,
    hasSubAccount: Boolean(map.get(SETTING_KEY_EZVIZ_RAM_ACCOUNT_ID)),
    allowMainToken: map.get(SETTING_KEY_EZVIZ_ALLOW_MAIN_TOKEN) === "1"
  });
}

const tokenModeSchema = z.object({ allowMainToken: z.boolean() });

/**
 * PATCH — bật/tắt chế độ dùng token tài khoản chính cho player. Tách khỏi PUT
 * để đổi công tắc không đòi nhập lại AppSecret.
 */
export async function PATCH(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const parsed = tokenModeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  await connectMongo();
  await AppSettingModel.updateOne(
    { key: SETTING_KEY_EZVIZ_ALLOW_MAIN_TOKEN },
    { $set: { value: parsed.data.allowMainToken ? "1" : "0" } },
    { upsert: true }
  );

  return NextResponse.json({ ok: true, allowMainToken: parsed.data.allowMainToken });
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
  await AppSettingModel.deleteMany({ key: { $in: DERIVED_KEYS } });

  return NextResponse.json({ ok: true });
}

/** Xoá cache token + region khi ghim nhầm domain. Giữ nguyên cặp key. */
export async function DELETE() {
  await connectMongo();
  await AppSettingModel.deleteMany({ key: { $in: DERIVED_KEYS } });
  return NextResponse.json({ ok: true });
}
