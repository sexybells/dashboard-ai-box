"""Tests for SE5 payload parsing (concatenated JSON, field extraction)."""
import base64
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from aibox_payload import parse_events, split_json_objects  # noqa: E402

# 1x1 JPEG is unnecessary; parsing only needs valid base64 for face_bytes().
FAKE_FACE = base64.b64encode(b"jpegbytes").decode()


def _event(direction, uid, quality, time):
    return f"""{{
      "UniqueId": "{uid}",
      "Media": {{ "MediaName": "{direction}" }},
      "Time": "{time}",
      "Result": {{
        "RelativeBox": [0.1, 0.2, 0.06, 0.13],
        "Properties": [
          {{ "property": "FrontFaceScore", "type": "float", "value": {quality} }},
          {{ "property": "cropped_face_image", "type": "image", "value": "{FAKE_FACE}" }}
        ]
      }}
    }}"""


def test_splits_concatenated_objects():
    text = _event("check-in", "A", 0.92, "2026-07-14 16:03:22") + "\n\n" + _event(
        "check-out", "B", 0.85, "2026-07-14 16:39:41"
    )
    assert len(split_json_objects(text)) == 2


def test_extracts_face_fields_from_both_events():
    text = _event("check-in", "A", 0.92, "2026-07-14 16:03:22") + "\n" + _event(
        "check-out", "B", 0.85, "2026-07-14 16:39:41"
    )
    events = parse_events(text)
    assert [e.direction for e in events] == ["check-in", "check-out"]
    assert events[0].unique_id == "A"
    assert events[0].quality == 0.92
    assert events[0].rel_box == [0.1, 0.2, 0.06, 0.13]
    assert events[0].face_bytes() == b"jpegbytes"
    assert events[0].time.strftime("%Y-%m-%d %H:%M:%S") == "2026-07-14 16:03:22"


def test_ignores_objects_without_a_face_crop():
    no_face = '{ "UniqueId": "X", "Result": { "Properties": [] } }'
    assert parse_events(no_face) == []
