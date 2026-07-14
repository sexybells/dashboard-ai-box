"""Unit tests for the pure dedup logic (no model needed — synthetic embeddings)."""
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from dedup_engine import DedupGallery  # noqa: E402


def unit(*vals, dim=512):
    v = np.zeros(dim, dtype=np.float32)
    for i, x in enumerate(vals):
        v[i] = x
    return v


def test_identical_face_is_a_repeat_not_a_new_visitor():
    g = DedupGallery(threshold=0.5, dim=4)
    a = g.add(unit(1, 0, 0, 0, dim=4))
    b = g.add(unit(1, 0, 0, 0, dim=4))
    assert a.is_new and not b.is_new
    assert a.visitor_id == b.visitor_id
    assert g.unique_count == 1
    assert g.clusters[0].sightings == 2


def test_orthogonal_faces_are_distinct_people():
    g = DedupGallery(threshold=0.5, dim=4)
    g.add(unit(1, 0, 0, 0, dim=4))
    g.add(unit(0, 1, 0, 0, dim=4))
    assert g.unique_count == 2


def test_near_duplicate_above_threshold_merges():
    g = DedupGallery(threshold=0.5, dim=4)
    g.add(unit(1.0, 0.0, 0, 0, dim=4))
    res = g.add(unit(0.9, 0.2, 0, 0, dim=4))  # cosine ~0.976 -> same person
    assert not res.is_new and res.score > 0.5
    assert g.unique_count == 1


def test_below_threshold_creates_new_person():
    g = DedupGallery(threshold=0.9, dim=4)
    g.add(unit(1.0, 0.0, 0, 0, dim=4))
    res = g.add(unit(0.7, 0.7, 0, 0, dim=4))  # cosine ~0.707 < 0.9 -> new
    assert res.is_new
    assert g.unique_count == 2


def test_best_quality_representative_update():
    g = DedupGallery(threshold=0.5, dim=4)
    g.add(unit(1, 0, 0, 0, dim=4), quality=0.6)
    g.add(unit(1, 0, 0, 0, dim=4), quality=0.9)  # higher quality -> becomes rep
    assert g.clusters[0].quality == pytest.approx(0.9)


def test_capacity_growth_beyond_initial():
    g = DedupGallery(threshold=0.99, dim=8, capacity=2)
    for i in range(20):  # forces several capacity doublings
        v = np.zeros(8, dtype=np.float32)
        v[i % 8] = 1.0
        v[(i * 7) % 8] += 0.01 * i
        g.add(v)
    assert g.unique_count >= 8
    assert g._mat.shape[0] >= g._n


def test_rejects_wrong_dimension():
    g = DedupGallery(threshold=0.5, dim=4)
    with pytest.raises(ValueError):
        g.add(np.ones(5, dtype=np.float32))
