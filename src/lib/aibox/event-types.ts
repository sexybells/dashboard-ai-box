// Summaries of AI Box events that are NOT security alarms.
//
// Two distinct lists, deliberately kept apart — they used to be one constant
// used with opposite meanings, which made adding FaceIdCount a trap:
//
// - COUNTING_SUMMARIES  : SOURCE of the footfall in/out chart (crossing events).
// - NON_ALARM_SUMMARIES : HIDDEN from the alarm list/stats views.
//
// FaceIdCount belongs only to the second list. It is a ~60s statistics
// heartbeat, so feeding it to footfall would add a phantom crossing per beat
// (~2.880/day) as soon as its camera is declared in FOOTFALL_CAMERA_DIRECTION.
export const HEADCOUNT_SUMMARY = "HeadCount";
export const PEOPLECROSS_SUMMARY = "PeopleCross";
export const FACEIDCOUNT_SUMMARY = "FaceIdCount";

/** Crossing counters powering the Lưu lượng khách page. */
export const COUNTING_SUMMARIES = [HEADCOUNT_SUMMARY, PEOPLECROSS_SUMMARY] as const;

/** Everything excluded from the Cảnh báo list and its statistics. */
export const NON_ALARM_SUMMARIES = [
  HEADCOUNT_SUMMARY,
  PEOPLECROSS_SUMMARY,
  FACEIDCOUNT_SUMMARY
] as const;
