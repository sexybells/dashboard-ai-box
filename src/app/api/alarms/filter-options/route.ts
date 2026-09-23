import { connectMongo } from "@/lib/mongodb";
import { AlarmModel } from "@/models/alarm";
import { NON_ALARM_SUMMARIES } from "@/lib/aibox/event-types";
import { normalizeOptionValues, type AlarmFilterOptions } from "@/services/alarm-filter-options";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Dropdown choices for /alarms, taken from EVERY stored alarm rather than the
// page on screen. Same exclusion as GET /api/alarms: counting traffic
// (HeadCount, PeopleCross, FaceIdCount) is not an alarm, so neither its
// summary nor cameras/tasks seen only through it belong in the choices.
export async function GET() {
  await connectMongo();

  const filter = { summary: { $nin: [...NON_ALARM_SUMMARIES] } };
  const [taskSessions, summaries, mediaNames] = await Promise.all([
    AlarmModel.distinct("taskSession", filter),
    AlarmModel.distinct("summary", filter),
    AlarmModel.distinct("mediaName", filter)
  ]);

  const options: AlarmFilterOptions = {
    taskSessions: normalizeOptionValues(taskSessions),
    summaries: normalizeOptionValues(summaries),
    mediaNames: normalizeOptionValues(mediaNames)
  };

  return NextResponse.json(options, { headers: { "Cache-Control": "no-store" } });
}
