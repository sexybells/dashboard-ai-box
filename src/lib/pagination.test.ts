import { describe, expect, it } from "vitest";
import { getPageRange, getPageSlots, PAGE_GAP } from "./pagination";

describe("getPageSlots", () => {
  it("returns nothing when there is no page", () => {
    expect(getPageSlots(1, 0)).toEqual([]);
  });

  it("lists every page while they fit without a gap", () => {
    expect(getPageSlots(2, 4)).toEqual([1, 2, 3, 4]);
  });

  it("puts a gap before the last page when the window is near the start", () => {
    expect(getPageSlots(2, 10)).toEqual([1, 2, 3, PAGE_GAP, 10]);
  });

  it("puts gaps on both sides for a page in the middle", () => {
    expect(getPageSlots(6, 10)).toEqual([1, PAGE_GAP, 5, 6, 7, PAGE_GAP, 10]);
  });

  it("keeps the first and last page reachable at the end of the range", () => {
    expect(getPageSlots(10, 10)).toEqual([1, PAGE_GAP, 9, 10]);
  });

  it("clamps a page outside the range", () => {
    expect(getPageSlots(99, 3)).toEqual([1, 2, 3]);
    expect(getPageSlots(0, 3)).toEqual([1, 2, 3]);
  });
});

describe("getPageRange", () => {
  it("describes the rows shown on a later page", () => {
    expect(getPageRange(2, 30, 30, 307)).toEqual({ from: 31, to: 60, total: 307 });
  });

  it("handles a partially filled last page", () => {
    expect(getPageRange(11, 30, 7, 307)).toEqual({ from: 301, to: 307, total: 307 });
  });

  it("collapses to zero when the page is empty", () => {
    expect(getPageRange(1, 30, 0, 0)).toEqual({ from: 0, to: 0, total: 0 });
  });
});
