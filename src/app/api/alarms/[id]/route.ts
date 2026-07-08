import { connectMongo } from "@/lib/mongodb";
import { AlarmModel } from "@/models/alarm";
import { isValidObjectId } from "mongoose";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  if (!isValidObjectId(id)) {
    return NextResponse.json({ ok: false, error: "Invalid alarm id" }, { status: 400 });
  }

  await connectMongo();
  const alarm = await AlarmModel.findById(id).lean();

  if (!alarm) {
    return NextResponse.json({ ok: false, error: "Alarm not found" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    data: {
      ...alarm,
      id: String(alarm._id),
      _id: String(alarm._id)
    }
  });
}
