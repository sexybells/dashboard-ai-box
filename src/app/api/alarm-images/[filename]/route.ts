import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getImageContentType, stripImageDataUri } from "@/lib/aibox/base64-image";
import { connectMongo } from "@/lib/mongodb";
import { AlarmModel } from "@/models/alarm";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ filename: string }> }
) {
  const { filename } = await context.params;

  if (!/^[a-zA-Z0-9_-]+\.(jpg|jpeg|png|gif)$/.test(filename)) {
    return NextResponse.json({ ok: false, error: "Invalid image filename" }, { status: 400 });
  }

  const filePath = join(process.cwd(), "storage", "alarm-images", filename);
  const extension = filename.split(".").pop()?.toLowerCase() || "jpg";
  const contentType = getImageContentType(extension);

  try {
    const file = await readFile(filePath);
    return new NextResponse(file, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable"
      }
    });
  } catch {
    await connectMongo();
    const alarm = await AlarmModel.findOne({
      imageUrl: `/api/alarm-images/${filename}`,
      imageKind: "base64"
    })
      .select("imageOriginal")
      .lean();

    if (typeof alarm?.imageOriginal === "string" && alarm.imageOriginal.length > 0) {
      return new NextResponse(Buffer.from(stripImageDataUri(alarm.imageOriginal), "base64"), {
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=31536000, immutable"
        }
      });
    }

    return NextResponse.json({ ok: false, error: "Image not found" }, { status: 404 });
  }
}
