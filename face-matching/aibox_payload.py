"""Parse SOPHGO SE5 Face Capture webhook events.

The AI Box may POST a single JSON object, or dump several pretty-printed objects
back-to-back (NOT a JSON array), so we brace-split instead of ``json.loads`` on
the whole text.

A Face Capture event carries NO face embedding — only images. The cropped face
JPEG (base64) lives at ``Result.Properties[?].value`` where
``property == "cropped_face_image"``. Downstream must embed it (see embedder.py).
"""
from __future__ import annotations

import base64
import json
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

FACE_PROPERTY = "cropped_face_image"
QUALITY_PROPERTY = "FrontFaceScore"
# The box `Time` field ("2026-07-14 16:03:24") is local wall-clock; the device
# is deployed in Asia/Saigon (UTC+7). Keep tz explicit so period keys are stable.
BOX_TZ = timezone(timedelta(hours=7))


@dataclass
class FaceEvent:
    unique_id: str | None
    direction: str            # Media.MediaName, e.g. "check-in" / "check-out"
    time: datetime | None     # box-local time, tz-aware
    quality: float | None     # FrontFaceScore in [0, 1]
    rel_box: list[float] | None  # [x, y, w, h] normalized face bbox
    face_b64: str             # cropped_face_image, raw base64 (no data: prefix)

    def face_bytes(self) -> bytes:
        return base64.b64decode(self.face_b64)


def split_json_objects(text: str) -> list[dict]:
    """Extract every top-level ``{...}`` object from concatenated JSON text."""
    objs: list[dict] = []
    depth = 0
    start = -1
    in_str = esc = False
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


def _prop(props: list[dict], name: str):
    return next((p.get("value") for p in props if p.get("property") == name), None)


def _parse_time(value) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        return datetime.strptime(value.strip(), "%Y-%m-%d %H:%M:%S").replace(tzinfo=BOX_TZ)
    except ValueError:
        return None


def extract_event(obj: dict) -> FaceEvent | None:
    """Return a FaceEvent if ``obj`` is a Face Capture event with a face crop."""
    result = obj.get("Result") or {}
    props = result.get("Properties") or []
    face_b64 = _prop(props, FACE_PROPERTY)
    if not isinstance(face_b64, str) or not face_b64:
        return None
    quality = _prop(props, QUALITY_PROPERTY)
    return FaceEvent(
        unique_id=obj.get("UniqueId") or obj.get("AlarmId"),
        direction=(obj.get("Media") or {}).get("MediaName") or "?",
        time=_parse_time(obj.get("Time")),
        quality=float(quality) if isinstance(quality, (int, float)) else None,
        rel_box=result.get("RelativeBox") if isinstance(result.get("RelativeBox"), list) else None,
        face_b64=face_b64,
    )


def parse_events(text: str) -> list[FaceEvent]:
    """Parse all Face Capture events from a (possibly concatenated) JSON dump."""
    return [e for o in split_json_objects(text) if (e := extract_event(o)) is not None]
