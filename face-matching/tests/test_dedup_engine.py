"""Unit tests for the pure dedup logic (no model needed — synthetic embeddings)."""
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from dedup_engine import DedupGallery, merged_count  # noqa: E402


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


def test_centroid_representative_is_running_mean():
    g = DedupGallery(threshold=0.5, dim=4, representative="centroid")
    g.add(unit(1, 0, 0, 0, dim=4))
    g.add(unit(0.8, 0.6, 0, 0, dim=4))  # cosine 0.8 -> same cluster
    # representative should now be the normalized mean of the two, not either one
    rep = g._mat[0]
    expected = np.array([1.8, 0.6, 0, 0], dtype=np.float32)
    expected = expected / np.linalg.norm(expected)
    assert np.allclose(rep, expected, atol=1e-4)
    assert g.unique_count == 1
    assert g.clusters[0].sightings == 2


def test_seed_inserts_distinct_clusters_without_dedup():
    g = DedupGallery(threshold=0.5, dim=4, representative="centroid")
    g.seed(unit(1, 0, 0, 0, dim=4), quality=0.9, sightings=3)
    g.seed(unit(1, 0, 0, 0, dim=4), quality=0.8)  # identical, but seed never merges
    assert g.unique_count == 2
    assert g.clusters[0].sightings == 3


def _norm(rows):
    a = np.array(rows, dtype=np.float32)
    return a / np.linalg.norm(a, axis=1, keepdims=True)


def test_merged_count_folds_small_fragments_into_large():
    reps = _norm([[1, 0, 0, 0], [0, 1, 0, 0], [0.9, 0.2, 0, 0], [0.1, 0.95, 0, 0]])
    # two large people + two small fragments near each -> 2 distinct people
    assert merged_count(reps, [50, 40, 5, 4], min_large_frac=0.35, merge_cos=0.2) == 2


def test_merged_count_keeps_dissimilar_small_cluster():
    reps = _norm([[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0]])
    # the small cluster is orthogonal to both large -> a genuine 3rd person
    assert merged_count(reps, [50, 40, 3], min_large_frac=0.35, merge_cos=0.2) == 3
