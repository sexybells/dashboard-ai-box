"""Unique-visitor dedup gallery.

Goal: count DISTINCT people. Each incoming face embedding is either assigned to
an existing person cluster (a repeat visitor -> does NOT increase the unique
count) or starts a new cluster (a new unique visitor).

This module is pure vector math with NO model dependency, so it is unit-testable
with synthetic embeddings. Scale target: up to ~20k clusters per period. Exact
cosine over a capacity-doubling float32 matrix keeps each query at a few ms and
avoids the O(n^2) cost of re-stacking a Python list every add.

Accuracy knobs (see plan): ``threshold`` (merge vs split), plus a best-quality
representative update that acts as lightweight multi-shot consolidation.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass
class Cluster:
    visitor_id: int
    quality: float          # quality of the current representative embedding
    sightings: int          # how many faces mapped to this person
    row: int                # index into the gallery matrix


@dataclass
class MatchResult:
    is_new: bool
    visitor_id: int
    score: float            # cosine to best existing cluster (-1.0 if gallery empty)


class DedupGallery:
    """Greedy online face-dedup: nearest-cluster above threshold, else new."""

    def __init__(self, threshold: float = 0.50, dim: int = 512, capacity: int = 16):
        if not 0.0 < threshold < 1.0:
            raise ValueError("threshold must be in (0, 1)")
        self.threshold = threshold
        self.dim = dim
        self._mat = np.zeros((max(1, capacity), dim), dtype=np.float32)
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
            grown = np.zeros((cap * 2, self.dim), dtype=np.float32)
            grown[:cap] = self._mat
            self._mat = grown

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
            # Multi-shot: keep the highest-quality frame as the representative.
            if quality is not None and quality > cluster.quality:
                self._mat[best_row] = q
                cluster.quality = quality
            return MatchResult(is_new=False, visitor_id=cluster.visitor_id, score=best_score)

        self._ensure_capacity()
        row = self._n
        self._mat[row] = q
        self._n += 1
        visitor_id = len(self.clusters)
        self.clusters.append(
            Cluster(visitor_id=visitor_id, quality=quality or 0.0, sightings=1, row=row)
        )
        return MatchResult(is_new=True, visitor_id=visitor_id, score=best_score)

    @property
    def unique_count(self) -> int:
        return len(self.clusters)
