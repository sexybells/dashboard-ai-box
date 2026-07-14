"""ArcFace embedder wrapping InsightFace ``buffalo_l`` (SCRFD detect+align +
ArcFace r50). Kept separate from the pure dedup logic so tests don't load a
300 MB model.

The box crop is a tight face; SCRFD sometimes needs margin to fire, so we
pad-and-retry once. Returns an L2-normalized 512-D embedding, or ``None`` when
no usable face is found.
"""
from __future__ import annotations

import cv2
import numpy as np


class ArcFaceEmbedder:
    def __init__(self, det_size: tuple[int, int] = (640, 640)):
        from insightface.app import FaceAnalysis  # lazy: heavy import

        self.app = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
        self.app.prepare(ctx_id=-1, det_size=det_size)

    def embed(self, img_bgr: np.ndarray) -> np.ndarray | None:
        for pad in (0.0, 0.6):
            src = img_bgr
            if pad:
                m = int(max(img_bgr.shape[:2]) * pad)
                src = cv2.copyMakeBorder(img_bgr, m, m, m, m, cv2.BORDER_REPLICATE)
            faces = self.app.get(src)
            if faces:
                face = max(
                    faces,
                    key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]),
                )
                return np.asarray(face.normed_embedding, dtype=np.float32)
        return None

    def embed_jpeg(self, jpeg_bytes: bytes) -> np.ndarray | None:
        img = cv2.imdecode(np.frombuffer(jpeg_bytes, np.uint8), cv2.IMREAD_COLOR)
        return None if img is None else self.embed(img)
