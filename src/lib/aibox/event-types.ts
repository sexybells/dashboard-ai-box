// Summaries of AI Box events that are NOT security alarms.
//
// Two distinct lists, deliberately kept apart — they used to be one constant
// used with opposite meanings, which made adding FaceIdCount a trap:
//
// - COUNTING_SUMMARIES  : SOURCE of the footfall in/out chart (crossing events).
// - NON_ALARM_SUMMARIES : HIDDEN from the alarm list/stats views.
//
// The two crossing counters (HeadCount, PeopleCross) are in BOTH lists: they
// feed the footfall chart AND stay out of the Cảnh báo list.
//
// They were briefly shown in that list on the grounds that hiding them left the
// data invisible, the footfall page not being deployed. That no longer holds:
// /api/webhooks/headcount-forward now folds HeadCount into the FaceIdCount
// figure, so the crossings surface as the visitor count on Tổng quan. Showing
// the raw rows as well only buries the security alarms — the box emits
// thousands of crossings a day (5.000+ on 2026-08-30 alone).
//
// FaceIdCount belongs only to the second list. It is a ~60s statistics
// heartbeat, so feeding it to footfall would add a phantom crossing per beat
// (~2.880/day) as soon as its camera is declared in FOOTFALL_CAMERA_DIRECTION.
// It also carries no image and no box, so a row per beat would be pure noise.
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
