"""Live unique-visitor worker.

The dashboard already stores every AI Box webhook in Mongo `webhook_events`.
This worker CONSUMES those events (read-only), keeps a rolling in-memory dedup
gallery, and persists unique-visitor results into its OWN collections. It never
touches the dashboard's write path.

Rolling window (handles overnight): one gallery over the last RETENTION_DAYS.
A visitor's "day" = first_seen (box-local date); daily unique = new visitors
that day. Embeddings older than the window are purged (biometric minimization).

Resumable: a cursor over `webhook_events._id` (ObjectId is time-ordered) is
stored in `matcher_state`, so a restart continues where it left off.

Env:
  MONGODB_URI      (required)  same Mongo the dashboard uses
  THRESHOLD        default 0.50   cosine merge threshold (calibrate!)
  MIN_QUALITY      default 0.50   drop faces with FrontFaceScore below this
  RETENTION_DAYS   default 3      rolling dedup window + purge horizon
  POLL_SECONDS     default 5      idle poll interval
  BATCH            default 200    events per fetch
"""
from __future__ import annotations

import os
import time
from datetime import datetime, timedelta, timezone

import numpy as np
from pymongo import ASCENDING, MongoClient

from aibox_payload import BOX_TZ, extract_event
from dedup_engine import DedupGallery, merged_count
from embedder import ArcFaceEmbedder

THRESHOLD = float(os.getenv("THRESHOLD", "0.40"))
MIN_QUALITY = float(os.getenv("MIN_QUALITY", "0.50"))
RETENTION_DAYS = int(os.getenv("RETENTION_DAYS", "3"))
POLL_SECONDS = int(os.getenv("POLL_SECONDS", "5"))
BATCH = int(os.getenv("BATCH", "200"))
# "centroid" (running-mean representative) roughly halves over-counting on the
# box's low-res crops vs "best"; see local calibration. Set REPRESENTATIVE=best
# to restore the previous single-frame behavior.
REPRESENTATIVE = os.getenv("REPRESENTATIVE", "centroid")
# Reported daily count folds small fragment clusters into the nearest large one
# (calibration: raw 7 -> 3 on the 3-person set). Set MERGE_MIN_LARGE_FRAC=0 to
# report the raw cluster count instead.
MERGE_MIN_LARGE_FRAC = float(os.getenv("MERGE_MIN_LARGE_FRAC", "0.35"))
MERGE_COS = float(os.getenv("MERGE_COS", "0.20"))


def day_key(dt: datetime) -> str:
    return dt.astimezone(BOX_TZ).strftime("%Y-%m-%d")


class Worker:
    def __init__(self, uri: str):
        self.db = MongoClient(uri).get_default_database()
        self.embedder = ArcFaceEmbedder()
        self.gallery = DedupGallery(threshold=THRESHOLD, representative=REPRESENTATIVE)
        self.visitor_ids: list = []  # gallery row -> visitors._id, aligned by visitor_id

    # ---- state ----------------------------------------------------------
    def _cutoff(self) -> datetime:
        return datetime.now(timezone.utc) - timedelta(days=RETENTION_DAYS)

    def load_gallery(self) -> None:
        """Warm the in-memory gallery from persisted visitors within the window."""
        cutoff = self._cutoff()
        docs = self.db.visitors.find({"last_seen": {"$gte": cutoff}}).sort("first_seen", ASCENDING)
        n = 0
        for d in docs:
            emb = np.asarray(d["embedding"], dtype=np.float32)
            # Seed each persisted visitor as its own cluster (already distinct people).
            self.gallery.seed(emb, quality=d.get("quality"), sightings=d.get("sightings", 1))
            self.visitor_ids.append(d["_id"])
            n += 1
        print(f"[startup] loaded {n} visitors into rolling gallery (window {RETENTION_DAYS}d)")

    def _cursor(self):
        st = self.db.matcher_state.find_one({"_id": "cursor"})
        return st.get("last_id") if st else None

    def _save_cursor(self, last_id) -> None:
        self.db.matcher_state.update_one(
            {"_id": "cursor"}, {"$set": {"last_id": last_id}}, upsert=True
        )

    # ---- processing -----------------------------------------------------
    def process_event(self, payload: dict, received_at: datetime) -> None:
        ev = extract_event(payload)
        if ev is None:  # not a Face Capture / no cropped face
            return
        if ev.quality is not None and ev.quality < MIN_QUALITY:
            return
        emb = self.embedder.embed_jpeg(ev.face_bytes())
        if emb is None:
            return
        seen = ev.time or received_at
        res = self.gallery.add(emb, quality=ev.quality)
        # Persist the cluster's CURRENT centroid so daily-count recompute is accurate.
        rep = self.gallery._mat[self.gallery.clusters[res.visitor_id].row]
        rep_list = [float(x) for x in rep]
        if res.is_new:
            doc = {
                "period_key": day_key(seen),
                "embedding": rep_list,
                "quality": ev.quality,
                "sightings": 1,
                "first_seen": seen,
                "last_seen": seen,
                "cameras": [ev.direction],
            }
            self.visitor_ids.append(self.db.visitors.insert_one(doc).inserted_id)
        else:
            self.db.visitors.update_one(
                {"_id": self.visitor_ids[res.visitor_id]},
                {
                    "$set": {"last_seen": seen, "embedding": rep_list},
                    "$inc": {"sightings": 1},
                    "$addToSet": {"cameras": ev.direction},
                },
            )

    def recompute_daily_counts(self) -> None:
        """Recompute visitor_daily_counts from current clusters, folding small
        fragment clusters into large ones (see dedup_engine.merged_count)."""
        cutoff = self._cutoff()
        groups: dict[str, tuple[list, list]] = {}
        for v in self.db.visitors.find(
            {"last_seen": {"$gte": cutoff}}, {"embedding": 1, "sightings": 1, "period_key": 1}
        ):
            pk = v.get("period_key")
            if not pk:
                continue
            embs, szs = groups.setdefault(pk, ([], []))
            embs.append(v["embedding"])
            szs.append(v.get("sightings", 1))
        now = datetime.now(timezone.utc)
        for pk, (embs, szs) in groups.items():
            reps = np.asarray(embs, dtype=np.float32)
            norms = np.linalg.norm(reps, axis=1, keepdims=True)
            norms[norms == 0] = 1.0
            count = merged_count(reps / norms, szs, MERGE_MIN_LARGE_FRAC, MERGE_COS)
            self.db.visitor_daily_counts.update_one(
                {"_id": pk}, {"$set": {"unique_count": count, "updated_at": now}}, upsert=True
            )

    def purge(self) -> None:
        """Drop biometric data older than the retention window (keep counts)."""
        res = self.db.visitors.delete_many({"last_seen": {"$lt": self._cutoff()}})
        if res.deleted_count:
            print(f"[purge] removed {res.deleted_count} expired visitor embeddings")

    def run(self) -> None:
        self.load_gallery()
        last_id = self._cursor()
        last_purge = time.monotonic()
        print(f"[run] threshold={THRESHOLD} representative={REPRESENTATIVE} "
              f"merge(frac={MERGE_MIN_LARGE_FRAC},cos={MERGE_COS}) polling every {POLL_SECONDS}s")
        while True:
            query = {"source": "aibox"}
            if last_id is not None:
                query["_id"] = {"$gt": last_id}
            batch = list(self.db.webhook_events.find(query).sort("_id", ASCENDING).limit(BATCH))
            for doc in batch:
                self.process_event(doc.get("payload") or {}, doc.get("receivedAt") or datetime.now(timezone.utc))
                last_id = doc["_id"]
            if batch:
                self._save_cursor(last_id)
                self.recompute_daily_counts()
            else:
                time.sleep(POLL_SECONDS)
            if time.monotonic() - last_purge > 3600:
                self.purge()
                last_purge = time.monotonic()


def main() -> int:
    uri = os.getenv("MONGODB_URI")
    if not uri:
        print("MONGODB_URI not set")
        return 1
    Worker(uri).run()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
