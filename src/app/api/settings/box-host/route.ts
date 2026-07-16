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
  const fallback = resolveDefaultBoxHost({
    AIBOX_HOST: process.env.AIBOX_HOST,
    NEXT_PUBLIC_AIBOX_HOST: process.env.NEXT_PUBLIC_AIBOX_HOST
  });
  return NextResponse.json({ ok: true, boxHost: doc?.value ?? fallback });
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
