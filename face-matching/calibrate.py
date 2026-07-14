"""Threshold calibration harness (P0).

Feed a directory of labeled face crops; the person label is the filename prefix
before the first underscore (e.g. ``alice_1.jpg``, ``alice_2.jpg``, ``bob_1.jpg``).
It embeds every image, then measures the cosine distribution for same-person vs
different-person pairs and reports the Equal-Error-Rate threshold — the number
that should drive DedupGallery in production.

This is the gate for trusting the unique count: without a real multi-person set,
the threshold is only a literature default (~0.5 for buffalo_l).

Usage:
  <env>/bin/python calibrate.py path/to/labeled_faces_dir
"""
from __future__ import annotations

import sys
from collections import defaultdict
from pathlib import Path

import cv2
import numpy as np

from embedder import ArcFaceEmbedder

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".bmp"}


def label_of(path: Path) -> str:
    return path.stem.split("_", 1)[0]


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: calibrate.py <dir-of-labeled-face-crops>")
        return 2
    root = Path(sys.argv[1])
    files = sorted(p for p in root.iterdir() if p.suffix.lower() in IMAGE_EXTS)
    if len(files) < 2:
        print("Need at least 2 labeled face images.")
        return 1

    embedder = ArcFaceEmbedder()
    embs: list[np.ndarray] = []
    labels: list[str] = []
    per_label: dict[str, int] = defaultdict(int)
    for f in files:
        img = cv2.imread(str(f))
        emb = None if img is None else embedder.embed(img)
        if emb is None:
            print(f"  [skip] no face: {f.name}")
            continue
        embs.append(emb / np.linalg.norm(emb))
        labels.append(label_of(f))
        per_label[label_of(f)] += 1

    n = len(embs)
    print(f"\nEmbedded {n} faces across {len(per_label)} people: "
          f"{dict(per_label)}\n")
    same, diff = [], []
    for i in range(n):
        for j in range(i + 1, n):
            s = float(np.dot(embs[i], embs[j]))
            (same if labels[i] == labels[j] else diff).append(s)

    if not same or not diff:
        print("Need both same-person AND different-person pairs to calibrate.")
        print(f"  same-person pairs: {len(same)}  different-person pairs: {len(diff)}")
        return 1

    same_a, diff_a = np.array(same), np.array(diff)
    print(f"same-person  pairs={len(same)}  cosine mean={same_a.mean():.3f} "
          f"min={same_a.min():.3f} max={same_a.max():.3f}")
    print(f"diff-person  pairs={len(diff)}  cosine mean={diff_a.mean():.3f} "
          f"min={diff_a.min():.3f} max={diff_a.max():.3f}")

    # Equal Error Rate: threshold where FRR (same below t) == FAR (diff above t).
    best_t, best_gap = 0.5, 1e9
    for t in np.linspace(0.1, 0.9, 161):
        frr = float((same_a < t).mean())   # same person wrongly split
        far = float((diff_a >= t).mean())  # different people wrongly merged
        if abs(frr - far) < best_gap:
            best_gap, best_t, best_eer = abs(frr - far), float(t), (frr + far) / 2
    print(f"\nSuggested threshold (EER) = {best_t:.3f}  (EER ~ {best_eer:.1%})")
    print("Use this as DedupGallery(threshold=...). Re-run whenever camera/lighting changes.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
