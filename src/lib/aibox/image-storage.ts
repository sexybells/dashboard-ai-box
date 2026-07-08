import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { stripImageDataUri } from "./base64-image";
import { getAiBoxImageKind, type AlarmImageKind } from "./normalize";

const ALARM_IMAGE_DIR = join(process.cwd(), "storage", "alarm-images");

export interface ImagePersistenceResult {
  kind: AlarmImageKind;
  localPath: string | null;
  publicUrl: string | null;
  original?: string;
}

function sanitizeFileStem(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "alarm-image";
}

function extensionForBase64(value: string): "jpg" | "png" | "gif" {
  if (value.startsWith("iVBOR")) return "png";
  if (value.startsWith("R0lGOD")) return "gif";
  return "jpg";
}

export async function persistAlarmImage(
  imageData: unknown,
  dedupeKey: string,
  imageDir = ALARM_IMAGE_DIR
): Promise<ImagePersistenceResult> {
  const kind = getAiBoxImageKind(imageData);

  if (kind !== "base64") {
    return {
      kind,
      localPath: null,
      publicUrl: null,
      original: typeof imageData === "string" ? imageData : undefined
    };
  }

  const value = stripImageDataUri(String(imageData));
  const extension = extensionForBase64(value);
  const filename = `${sanitizeFileStem(dedupeKey)}.${extension}`;
  const localPath = join(imageDir, filename);

  await mkdir(imageDir, { recursive: true });
  await writeFile(localPath, Buffer.from(value, "base64"));

  return {
    kind,
    localPath,
    publicUrl: `/api/alarm-images/${filename}`,
    original: typeof imageData === "string" ? imageData : undefined
  };
}
