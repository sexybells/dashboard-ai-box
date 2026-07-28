import { unlink } from "node:fs/promises";
import { join } from "node:path";

const ALARM_IMAGE_DIR = join(process.cwd(), "storage", "alarm-images");

// Mirrors the filename rule enforced by the alarm-image route so a crafted
// imageUrl can never resolve outside storage/alarm-images.
const IMAGE_URL_PATTERN = /^\/api\/alarm-images\/([a-zA-Z0-9_-]+\.(?:jpg|jpeg|png|gif))$/;

export interface AlarmImageRef {
  imageKind?: string | null;
  imageUrl?: string | null;
}

/**
 * Only "base64" alarms own a file on disk: "aibox-path" images live on the box
 * and "none" has nothing to clean up.
 */
export function resolveAlarmImageFilename(alarm: AlarmImageRef): string | null {
  if (alarm.imageKind !== "base64") return null;
  const match = IMAGE_URL_PATTERN.exec(alarm.imageUrl ?? "");
  return match ? match[1] : null;
}

/**
 * Removes the local image files owned by the given alarms. A missing file is
 * not an error — older alarms may only exist as base64 inside MongoDB.
 */
export async function deleteAlarmImageFiles(
  alarms: readonly AlarmImageRef[],
  imageDir = ALARM_IMAGE_DIR
): Promise<void> {
  const filenames = new Set(
    alarms.map(resolveAlarmImageFilename).filter((name): name is string => name !== null)
  );

  await Promise.all(
    [...filenames].map(async (filename) => {
      try {
        await unlink(join(imageDir, filename));
      } catch {
        // Nothing to remove.
      }
    })
  );
}
