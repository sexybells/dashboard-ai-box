import { describe, expect, it } from "vitest";
import {
  areAllSelected,
  pruneSelection,
  toggleAllSelection,
  toggleSelection
} from "./alarm-selection";

describe("toggleSelection", () => {
  it("adds an unselected id and removes a selected one", () => {
    expect([...toggleSelection(new Set(), "a")]).toEqual(["a"]);
    expect([...toggleSelection(new Set(["a", "b"]), "a")]).toEqual(["b"]);
  });
});

describe("areAllSelected", () => {
  it("is false for an empty list", () => {
    expect(areAllSelected(new Set(["a"]), [])).toBe(false);
  });

  it("is true only when every visible id is selected", () => {
    expect(areAllSelected(new Set(["a", "b"]), ["a", "b"])).toBe(true);
    expect(areAllSelected(new Set(["a"]), ["a", "b"])).toBe(false);
  });
});

describe("toggleAllSelection", () => {
  it("selects every visible id when some are unselected", () => {
    expect([...toggleAllSelection(new Set(["a"]), ["a", "b"])].sort()).toEqual(["a", "b"]);
  });

  it("clears the visible ids when all are selected, keeping others", () => {
    expect([...toggleAllSelection(new Set(["a", "b", "hidden"]), ["a", "b"])]).toEqual(["hidden"]);
  });
});

describe("pruneSelection", () => {
  it("drops ids that are no longer visible after a refresh", () => {
    expect([...pruneSelection(new Set(["a", "gone"]), ["a", "b"])]).toEqual(["a"]);
  });
});
