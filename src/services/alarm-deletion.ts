import { isValidObjectId } from "mongoose";
import { deleteAlarmImageFiles } from "@/lib/aibox/image-cleanup";
import { connectMongo } from "@/lib/mongodb";
import { AlarmModel } from "@/models/alarm";

// Matches the maximum page size of the alarm list so the UI can never select
// more rows than a single delete request accepts.
export const MAX_DELETE_IDS = 100;

export type ParsedDeleteIds =
  | { ok: true; ids: string[] }
  | { ok: false; error: string };

export function parseDeleteIds(body: unknown): ParsedDeleteIds {
  const ids = typeof body === "object" && body !== null ? (body as { ids?: unknown }).ids : undefined;

  if (!Array.isArray(ids) || ids.length === 0) {
    return { ok: false, error: "Cần chọn ít nhất một cảnh báo" };
  }

  if (ids.length > MAX_DELETE_IDS) {
    return { ok: false, error: `Chỉ xoá tối đa ${MAX_DELETE_IDS} cảnh báo mỗi lần` };
  }

  const valid = [
    ...new Set(ids.filter((id): id is string => typeof id === "string" && isValidObjectId(id)))
  ];

  if (valid.length === 0) {
    return { ok: false, error: "Danh sách cảnh báo không hợp lệ" };
  }

  return { ok: true, ids: valid };
}

/**
 * Permanently removes alarms and the image files they own. Image references are
 * read before the delete so orphaned files can still be located.
 */
export async function deleteAlarmsByIds(ids: readonly string[]): Promise<number> {
  if (ids.length === 0) return 0;

  await connectMongo();

  const alarms = await AlarmModel.find({ _id: { $in: ids } })
    .select("imageKind imageUrl")
    .lean<Array<{ imageKind?: string; imageUrl?: string | null }>>();

  if (alarms.length === 0) return 0;

  const result = await AlarmModel.deleteMany({ _id: { $in: ids } });
  await deleteAlarmImageFiles(alarms);

  return result.deletedCount ?? 0;
}
