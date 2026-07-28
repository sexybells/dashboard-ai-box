import { describe, expect, it } from "vitest";
import { MAX_DELETE_IDS, parseDeleteIds } from "./alarm-deletion";

const validId = "507f1f77bcf86cd799439011";
const otherId = "507f1f77bcf86cd799439012";

describe("parseDeleteIds", () => {
  it("accepts a list of object ids and removes duplicates", () => {
    expect(parseDeleteIds({ ids: [validId, otherId, validId] })).toEqual({
      ok: true,
      ids: [validId, otherId]
    });
  });

  it("drops entries that are not object ids", () => {
    expect(parseDeleteIds({ ids: [validId, "not-an-id", 42, null] })).toEqual({
      ok: true,
      ids: [validId]
    });
  });

  it("rejects a body without a usable list", () => {
    expect(parseDeleteIds(null).ok).toBe(false);
    expect(parseDeleteIds({}).ok).toBe(false);
    expect(parseDeleteIds({ ids: [] }).ok).toBe(false);
  });

  it("rejects a list where no id is valid", () => {
    expect(parseDeleteIds({ ids: ["not-an-id"] }).ok).toBe(false);
  });

  it("rejects more ids than a single request allows", () => {
    const ids = Array.from({ length: MAX_DELETE_IDS + 1 }, () => validId);
    expect(parseDeleteIds({ ids }).ok).toBe(false);
  });
});
