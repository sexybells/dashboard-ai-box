import { afterEach, describe, expect, it } from "vitest";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { persistAlarmImage } from "./image-storage";

const testDir = join(process.cwd(), "tmp-test-images");

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe("persistAlarmImage", () => {
  it("writes JPEG base64 ImageData to a deterministic local file", async () => {
    const base64Jpeg = "/9j/4AAQSkZJRgABAQAAAQABAAD/2w==";

    const result = await persistAlarmImage(base64Jpeg, "unique:ALARM_123", testDir);

    expect(result.kind).toBe("base64");
    expect(result.localPath.endsWith(".jpg")).toBe(true);
    expect(result.publicUrl).toMatch(/^\/api\/alarm-images\/unique-ALARM_123\.jpg$/);
  });

  it("does not write local files for AI Box image path values", async () => {
    const result = await persistAlarmImage(
      "Images/DAY_20260708/IMAGE_raw.jpg",
      "hash:test",
      testDir
    );

    expect(result.kind).toBe("aibox-path");
    expect(result.localPath).toBeNull();
    expect(result.publicUrl).toBeNull();
    expect(result.original).toBe("Images/DAY_20260708/IMAGE_raw.jpg");
  });
});
