"""Run the unique-visitor dedup over a file of SE5 Face Capture events.

Offline P1 driver: parse events -> quality gate -> ArcFace embed -> DedupGallery
per period -> report unique count and per-person sightings. Proves the counting
logic end-to-end before wiring it to the live webhook/queue at deploy time.

Usage:
  <env>/bin/python run_dedup.py events.json [--threshold 0.5] [--min-quality 0.5]
                                            [--period all|day]
"""
from __future__ import annotations

import argparse
from collections import defaultdict
from pathlib import Path

from aibox_payload import FaceEvent, parse_events
from dedup_engine import DedupGallery
from embedder import ArcFaceEmbedder


def period_key(ev: FaceEvent, mode: str) -> str:
    if mode == "day" and ev.time is not None:
        return ev.time.strftime("%Y-%m-%d")
    return "all"


def main() -> int:
    ap = argparse.ArgumentParser(description="Unique-visitor face dedup (SE5).")
    ap.add_argument("events", help="path to a JSON dump of Face Capture events")
    ap.add_argument("--threshold", type=float, default=0.50,
                    help="cosine threshold to treat two faces as the same person")
    ap.add_argument("--min-quality", type=float, default=0.50,
                    help="drop faces with FrontFaceScore below this (quality gate)")
    ap.add_argument("--period", choices=["all", "day"], default="all",
                    help="dedup scope: one gallery for the whole file, or per box-local day")
    args = ap.parse_args()

    events = parse_events(Path(args.events).read_text(encoding="utf-8"))
    if not events:
        print("No Face Capture events with a cropped face found.")
        return 1

    embedder = ArcFaceEmbedder()
    galleries: dict[str, DedupGallery] = defaultdict(lambda: DedupGallery(threshold=args.threshold))
    stats = {"total": 0, "gated": 0, "no_face": 0, "new": 0, "repeat": 0}

    for ev in events:
        stats["total"] += 1
        if ev.quality is not None and ev.quality < args.min_quality:
            stats["gated"] += 1
            continue
        emb = embedder.embed_jpeg(ev.face_bytes())
        if emb is None:
            stats["no_face"] += 1
            continue
        res = galleries[period_key(ev, args.period)].add(emb, quality=ev.quality)
        stats["new" if res.is_new else "repeat"] += 1

    print(f"\nEvents: {stats['total']}  | quality-gated: {stats['gated']}  | "
          f"no-face: {stats['no_face']}  | new: {stats['new']}  | repeat: {stats['repeat']}")
    print(f"threshold={args.threshold}  min_quality={args.min_quality}  period={args.period}\n")

    total_unique = 0
    for key in sorted(galleries):
        g = galleries[key]
        total_unique += g.unique_count
        print(f"period {key}: unique visitors = {g.unique_count}")
        for c in g.clusters:
            print(f"    visitor #{c.visitor_id}: sightings={c.sightings} rep_quality={c.quality:.2f}")
    print(f"\nTOTAL UNIQUE VISITORS = {total_unique}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
