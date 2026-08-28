import { describe, expect, it } from "vitest";
import { extractDetectionBoxes, extractFrameAspectRatio } from "./detection-boxes";

describe("extractDetectionBoxes", () => {
  it("reads Result.RelativeBox as [x, y, width, height]", () => {
    // Real "Climb" payload from the box.
    const boxes = extractDetectionBoxes({
      Summary: "Climb",
      Result: { Description: "Climb", RelativeBox: [0.726, 0.0018, 0.0802, 0.2379] }
    });

    expect(boxes).toHaveLength(1);
    expect(boxes[0]).toMatchObject({ x: 0.726, y: 0.0018, label: "Climb" });
    expect(boxes[0].width).toBeCloseTo(0.0802);
    expect(boxes[0].height).toBeCloseTo(0.2379);
  });

  it("reads ExtraObjects points as opposite rectangle corners", () => {
    const boxes = extractDetectionBoxes({
      Result: {
        RelativeBox: [],
        ExtraObjects: [
          { Description: "cigarette", Points: [{ X: 0.36, Y: 0.25 }, { X: 0.37, Y: 0.27 }] }
        ]
      }
    });

    expect(boxes).toHaveLength(1);
    expect(boxes[0].x).toBeCloseTo(0.36);
    expect(boxes[0].y).toBeCloseTo(0.25);
    expect(boxes[0].width).toBeCloseTo(0.01);
    expect(boxes[0].height).toBeCloseTo(0.02);
    expect(boxes[0].label).toBe("cigarette");
  });

  it("keeps the main box and every extra object", () => {
    const boxes = extractDetectionBoxes({
      Summary: "Playing",
      Result: {
        RelativeBox: [0.454, 0.3055, 0.0948, 0.2435],
        ExtraObjects: [{ Points: [{ X: 0.454, Y: 0.337 }, { X: 0.473, Y: 0.38 }] }]
      }
    });

    expect(boxes).toHaveLength(2);
    expect(boxes[0].label).toBe("Playing");
  });

  it("orders corner points regardless of which one comes first", () => {
    const boxes = extractDetectionBoxes({
      Result: { ExtraObjects: [{ Points: [{ X: 0.5, Y: 0.6 }, { X: 0.2, Y: 0.1 }] }] }
    });

    expect(boxes[0]).toMatchObject({ x: 0.2, y: 0.1 });
    expect(boxes[0].width).toBeCloseTo(0.3);
    expect(boxes[0].height).toBeCloseTo(0.5);
  });

  it("clamps a box that runs past the frame edge", () => {
    const boxes = extractDetectionBoxes({
      Result: { RelativeBox: [0.9, -0.1, 0.5, 0.4] }
    });

    expect(boxes[0]).toMatchObject({ x: 0.9, y: 0 });
    expect(boxes[0].width).toBeCloseTo(0.1);
    expect(boxes[0].height).toBeCloseTo(0.3);
  });

  it("drops boxes with no area and malformed coordinates", () => {
    expect(extractDetectionBoxes({ Result: { RelativeBox: [0.5, 0.5, 0, 0.2] } })).toEqual([]);
    expect(extractDetectionBoxes({ Result: { RelativeBox: [0.5, 0.5, "x", 0.2] } })).toEqual([]);
    expect(extractDetectionBoxes({ Result: { RelativeBox: [0.5, 0.5] } })).toEqual([]);
    expect(extractDetectionBoxes({ Result: { ExtraObjects: [{ Points: [{ X: 0.1, Y: 0.1 }] }] } })).toEqual([]);
  });

  it("returns nothing for payloads without a Result", () => {
    expect(extractDetectionBoxes(undefined)).toEqual([]);
    expect(extractDetectionBoxes({})).toEqual([]);
    expect(extractDetectionBoxes({ Result: {} })).toEqual([]);
  });
});

describe("extractFrameAspectRatio", () => {
  it("uses the source media dimensions", () => {
    expect(extractFrameAspectRatio({ Media: { MediaWidth: 1920, MediaHeight: 1080 } })).toBeCloseTo(16 / 9);
  });

  it("is undefined when dimensions are missing or unusable", () => {
    expect(extractFrameAspectRatio({})).toBeUndefined();
    expect(extractFrameAspectRatio({ Media: { MediaWidth: 0, MediaHeight: 1080 } })).toBeUndefined();
  });
});
