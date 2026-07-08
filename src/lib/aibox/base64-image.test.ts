import { describe, expect, it } from "vitest";
import { getImageContentType, stripImageDataUri } from "./base64-image";

describe("base64 image helpers", () => {
  it("strips data URI headers from base64 image payloads", () => {
    expect(stripImageDataUri("data:image/jpeg;base64,/9j/test")).toBe("/9j/test");
  });

  it("maps image extensions to content types", () => {
    expect(getImageContentType("jpg")).toBe("image/jpeg");
    expect(getImageContentType("png")).toBe("image/png");
  });
});
