"""Unique-visitor dedup gallery.

Goal: count DISTINCT people. Each incoming face embedding is either assigned to
an existing person cluster (a repeat visitor -> does NOT increase the unique
count) or starts a new cluster (a new unique visitor).

Pure vector math, no model dependency, so it is unit-testable with synthetic
embeddings. Scale target: up to ~20k clusters per period; exact cosine over a
capacity-doubling float32 matrix keeps each query at a few ms.

Representative modes (accuracy knob — see the local calibration experiments):
- "best": the cluster is represented by its single highest-quality embedding.
- "centroid": the cluster is represented by the L2-normalized MEAN of all its
  embeddings. On real low-res crops this is markedly more stable and roughly
  halves the over-counting vs "best" (e.g. 3 people: best->15, centroid->7),
  because a single noisy frame no longer defines the whole identity.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass
class Cluster:
    visitor_id: int
    quality: float          # quality of the current "best" representative
    sightings: int          # how many faces mapped to this person
    row: int                # index into the gallery matrix


@dataclass
class MatchResult:
    is_new: bool
    visitor_id: int
    score: float            # cosine to best existing cluster (-1.0 if gallery empty)


class DedupGallery:
    """Greedy online face-dedup: nearest-cluster above threshold, else new."""

    def __init__(
        self,
        threshold: float = 0.50,
        dim: int = 512,
        capacity: int = 16,
        representative: str = "best",
    ):
        if not 0.0 < threshold < 1.0:
            raise ValueError("threshold must be in (0, 1)")
        if representative not in ("best", "centroid"):
            raise ValueError("representative must be 'best' or 'centroid'")
        self.threshold = threshold
        self.dim = dim
        self.representative = representative
        cap = max(1, capacity)
        self._mat = np.zeros((cap, dim), dtype=np.float32)   # normalized representatives
        self._sums = np.zeros((cap, dim), dtype=np.float32)  # running sums (centroid mode)
        self._n = 0
        self.clusters: list[Cluster] = []

    @staticmethod
    def _normalize(vec: np.ndarray) -> np.ndarray:
        vec = np.asarray(vec, dtype=np.float32).reshape(-1)
        norm = float(np.linalg.norm(vec))
        return vec / norm if norm > 0 else vec

    def _ensure_capacity(self) -> None:
        cap = self._mat.shape[0]
        if self._n >= cap:
            for name in ("_mat", "_sums"):
                grown = np.zeros((cap * 2, self.dim), dtype=np.float32)
                grown[:cap] = getattr(self, name)
                setattr(self, name, grown)

    def add(self, embedding: np.ndarray, quality: float | None = None) -> MatchResult:
        """Assign ``embedding`` to a cluster. Returns whether it was a new person."""
        q = self._normalize(embedding)
        if q.shape[0] != self.dim:
            raise ValueError(f"embedding dim {q.shape[0]} != gallery dim {self.dim}")

        best_row, best_score = -1, -1.0
        if self._n > 0:
            scores = self._mat[: self._n] @ q          # (n,) cosine, all L2-normalized
            best_row = int(np.argmax(scores))
            best_score = float(scores[best_row])

        if best_score >= self.threshold:
            cluster = self.clusters[best_row]
            cluster.sightings += 1
            if self.representative == "centroid":
                self._sums[best_row] += q
                self._mat[best_row] = self._normalize(self._sums[best_row])
                if quality is not None and quality > cluster.quality:
                    cluster.quality = quality
            elif quality is not None and quality > cluster.quality:
                # "best": keep the highest-quality frame as the representative.
                self._mat[best_row] = q
                cluster.quality = quality
            return MatchResult(is_new=False, visitor_id=cluster.visitor_id, score=best_score)

        self._ensure_capacity()
        row = self._n
        self._mat[row] = q
        self._sums[row] = q
        self._n += 1
        visitor_id = len(self.clusters)
        self.clusters.append(
            Cluster(visitor_id=visitor_id, quality=quality or 0.0, sightings=1, row=row)
        )
        return MatchResult(is_new=True, visitor_id=visitor_id, score=best_score)

    def seed(self, embedding: np.ndarray, quality: float | None = None, sightings: int = 1) -> int:
        """Insert a cluster directly, bypassing dedup — for loading persisted
        visitors on restart (each stored visitor is already a distinct person)."""
        q = self._normalize(embedding)
        if q.shape[0] != self.dim:
            raise ValueError(f"embedding dim {q.shape[0]} != gallery dim {self.dim}")
        self._ensure_capacity()
        row = self._n
        self._mat[row] = q
        # Approximate the accumulated sum so centroid updates continue sensibly
        # (only the normalized rep is persisted, not the raw running sum).
        self._sums[row] = q * float(max(1, sightings))
        self._n += 1
        visitor_id = len(self.clusters)
        self.clusters.append(
            Cluster(visitor_id=visitor_id, quality=quality or 0.0, sightings=max(1, sightings), row=row)
        )
        return visitor_id

    @property
    def unique_count(self) -> int:
        return len(self.clusters)


def merged_count(
    reps: np.ndarray,
    sightings,
    min_large_frac: float = 0.35,
    merge_cos: float = 0.20,
) -> int:
    """Fold small fragment clusters into the nearest large cluster; return the
    number of distinct people.

    On low-res crops a person's hard-angle/blurred frames split into small extra
    clusters that inflate the raw count. Those fragments are always most similar
    to their OWN person's large centroid, so folding SMALL clusters into the
    nearest LARGE centroid removes the inflation while never merging two distinct
    large people. On the 3-person calibration set this turns the raw 7 into 3.

    Caveat: it assumes real people generate many more captures than their own
    fragments, so a genuine brief visitor (very few captures) may be folded into
    a frequent visitor -> tune `min_large_frac`/`merge_cos` per camera and
    re-validate against labeled sessions.

    reps: (k, dim) L2-normalized cluster centroids. sightings: per-cluster counts.
    """
    sightings = np.asarray(sightings)
    k = len(sightings)
    if k <= 1:
        return int(k)
    reps = np.asarray(reps, dtype=np.float32)
    min_large = max(2.0, min_large_frac * float(sightings.max()))
    large = np.where(sightings >= min_large)[0]
    if len(large) == 0:
        return int(k)
    survivors = {int(c) for c in large}
    for s in np.where(sightings < min_large)[0]:
        if float((reps[large] @ reps[s]).max()) < merge_cos:
            survivors.add(int(s))  # too dissimilar to fold -> its own person
    return len(survivors)
