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
from dedup_engine import DedupGallery
from embedder import ArcFaceEmbedder

THRESHOLD = float(os.getenv("THRESHOLD", "0.50"))
MIN_QUALITY = float(os.getenv("MIN_QUALITY", "0.50"))
RETENTION_DAYS = int(os.getenv("RETENTION_DAYS", "3"))
POLL_SECONDS = int(os.getenv("POLL_SECONDS", "5"))
BATCH = int(os.getenv("BATCH", "200"))


def day_key(dt: datetime) -> str:
    return dt.astimezone(BOX_TZ).strftime("%Y-%m-%d")


class Worker:
    def __init__(self, uri: str):
        self.db = MongoClient(uri).get_default_database()
        self.embedder = ArcFaceEmbedder()
        self.gallery = DedupGallery(threshold=THRESHOLD)
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
            res = self.gallery.add(emb, quality=d.get("quality"))
            # First insert of each distinct persisted person creates a new row.
            if res.is_new:
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
        if res.is_new:
            pk = day_key(seen)
            doc = {
                "period_key": pk,
                "embedding": [float(x) for x in emb],
                "quality": ev.quality,
                "sightings": 1,
                "first_seen": seen,
                "last_seen": seen,
                "cameras": [ev.direction],
            }
            _id = self.db.visitors.insert_one(doc).inserted_id
            self.visitor_ids.append(_id)
            self.db.visitor_daily_counts.update_one(
                {"_id": pk}, {"$inc": {"unique_count": 1}, "$set": {"updated_at": datetime.now(timezone.utc)}}, upsert=True
            )
        else:
            _id = self.visitor_ids[res.visitor_id]
            self.db.visitors.update_one(
                {"_id": _id},
                {"$set": {"last_seen": seen}, "$inc": {"sightings": 1}, "$addToSet": {"cameras": ev.direction}},
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
        print(f"[run] threshold={THRESHOLD} min_quality={MIN_QUALITY} polling every {POLL_SECONDS}s")
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
