#!/usr/bin/env python3
"""Face-match demo for the SE5 in/out counting spike.

The SE5 Face Capture event carries NO embedding — only images. Each event stores
a pre-cropped face JPEG (base64) at Result.Properties[?].value where
property == "cropped_face_image". This script proves the Case-B design: run
ArcFace (InsightFace buffalo_l) on the in-face and out-face crops and compare
them with cosine similarity — exactly what the backend must do to decide whether
someone leaving at check-out is the same person who entered at check-in.

Input file may contain one OR several concatenated pretty-printed JSON objects
(the AI Box dumps them back-to-back), so we brace-split instead of json.load.

Run with the demo env:
  <scratchpad>/faceenv/bin/python scripts/face_match_demo.py [path-to.json]
"""
from __future__ import annotations

import base64
import json
import sys
from pathlib import Path

import cv2
import numpy as np

DEFAULT_JSON = "/Users/duongnguyenhai/Downloads/face-capture.json"
FACE_PROPERTY = "cropped_face_image"
OUT_DIR = Path(
    "/private/tmp/claude-501/-Users-duongnguyenhai-Work-AiBoxDashboard/"
    "564ab050-eba0-41aa-bb69-5eb1d16c8344/scratchpad"
)

# ArcFace/buffalo_l cosine bands (calibrate with real traffic later).
SAME = 0.50   # >= : same person, high confidence
MAYBE = 0.35  # [MAYBE, SAME): likely same -> manual review


def split_json_objects(text: str) -> list[dict]:
    """Extract every top-level {...} object from concatenated JSON text."""
    objs, depth, start, in_str, esc = [], 0, -1, False, False
    for i, c in enumerate(text):
        if in_str:
            if esc:
                esc = False
            elif c == "\\":
                esc = True
            elif c == '"':
                in_str = False
            continue
        if c == '"':
            in_str = True
        elif c == "{":
            if depth == 0:
                start = i
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0 and start >= 0:
                objs.append(json.loads(text[start : i + 1]))
                start = -1
    return objs


def extract_event(ev: dict) -> dict | None:
    """Pull the fields the matcher needs out of one Face Capture event."""
    result = ev.get("Result") or {}
    props = result.get("Properties") or []
    face_b64 = next(
        (p.get("value") for p in props if p.get("property") == FACE_PROPERTY), None
    )
    if not face_b64:
        return None
    quality = next(
        (p.get("value") for p in props if p.get("property") == "FrontFaceScore"), None
    )
    return {
        "direction": (ev.get("Media") or {}).get("MediaName") or "?",
        "unique_id": ev.get("UniqueId") or ev.get("AlarmId"),
        "time": ev.get("Time"),
        "quality": quality,
        "face_b64": face_b64,
    }


def decode_face(b64: str) -> np.ndarray:
    raw = base64.b64decode(b64)
    img = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("could not decode cropped_face_image")
    return img


def embed(app, img: np.ndarray) -> np.ndarray | None:
    """Return an L2-normalized ArcFace embedding for the largest detected face.

    The box crop is tight (face fills the frame); SCRFD sometimes needs margin
    to fire, so pad and retry once before giving up.
    """
    for pad in (0, 0.6):
        src = img
        if pad:
            m = int(max(img.shape[:2]) * pad)
            src = cv2.copyMakeBorder(img, m, m, m, m, cv2.BORDER_REPLICATE)
        faces = app.get(src)
        if faces:
            face = max(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))
            return face.normed_embedding
    return None


def verdict(score: float) -> str:
    if score >= SAME:
        return "SAME person (high confidence)"
    if score >= MAYBE:
        return "LIKELY same -> manual review"
    return "DIFFERENT person"


def main() -> int:
    path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_JSON
    text = Path(path).read_text(encoding="utf-8")
    events = [e for e in (extract_event(o) for o in split_json_objects(text)) if e]
    if not events:
        print("No Face Capture events with a cropped_face_image found.")
        return 1

    # Lazy import so JSON parsing errors surface before the heavy model load.
    from insightface.app import FaceAnalysis

    app = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
    app.prepare(ctx_id=-1, det_size=(640, 640))

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"\nLoaded {len(events)} face event(s) from {path}\n")
    for idx, e in enumerate(events):
        img = decode_face(e["face_b64"])
        e["img"] = img
        e["emb"] = embed(app, img)
        crop_path = OUT_DIR / f"face_{idx}_{e['direction']}.png"
        cv2.imwrite(str(crop_path), img)
        q = f"{e['quality']:.2f}" if isinstance(e["quality"], (int, float)) else e["quality"]
        status = "embedded" if e["emb"] is not None else "NO FACE DETECTED"
        print(
            f"  [{idx}] {e['direction']:<10} {img.shape[1]}x{img.shape[0]}px  "
            f"quality={q}  {status}  time={e['time']}  -> {crop_path.name}"
        )

    ins = [e for e in events if e["direction"].startswith("check-in") and e["emb"] is not None]
    outs = [e for e in events if e["direction"].startswith("check-out") and e["emb"] is not None]

    print("\n" + "=" * 60)
    if ins and outs:
        print("IN <-> OUT matching (cosine similarity):\n")
        for o in outs:
            best = max(ins, key=lambda i: float(np.dot(i["emb"], o["emb"])))
            score = float(np.dot(best["emb"], o["emb"]))
            print(f"  check-out {o['unique_id']}")
            print(f"    best check-in match: {best['unique_id']}")
            print(f"    cosine = {score:.4f}  ->  {verdict(score)}")
    else:
        # Fallback: no clear in/out split -> full pairwise matrix.
        embedded = [e for e in events if e["emb"] is not None]
        print("Pairwise cosine similarity:\n")
        for a in range(len(embedded)):
            for b in range(a + 1, len(embedded)):
                s = float(np.dot(embedded[a]["emb"], embedded[b]["emb"]))
                print(
                    f"  [{a}]{embedded[a]['direction']} vs [{b}]{embedded[b]['direction']}: "
                    f"cosine={s:.4f}  ->  {verdict(s)}"
                )
    print("=" * 60)
    print(f"\nDecoded crops saved to: {OUT_DIR}")
    print("Bands: SAME>={:.2f}  REVIEW>={:.2f}  (calibrate with real traffic)".format(SAME, MAYBE))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
