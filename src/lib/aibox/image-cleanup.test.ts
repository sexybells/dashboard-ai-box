import { mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { deleteAlarmImageFiles, resolveAlarmImageFilename } from "./image-cleanup";

describe("resolveAlarmImageFilename", () => {
  it("returns the filename for a locally stored base64 alarm image", () => {
    expect(
      resolveAlarmImageFilename({ imageKind: "base64", imageUrl: "/api/alarm-images/unique-ALARM_1.jpg" })
    ).toBe("unique-ALARM_1.jpg");
  });

  it("ignores images that are not stored locally", () => {
    expect(
      resolveAlarmImageFilename({ imageKind: "aibox-path", imageUrl: "/api/alarm-images/a.jpg" })
    ).toBeNull();
    expect(resolveAlarmImageFilename({ imageKind: "none", imageUrl: null })).toBeNull();
  });

  it("rejects paths that try to escape the image directory", () => {
    expect(
      resolveAlarmImageFilename({ imageKind: "base64", imageUrl: "/api/alarm-images/../../.env" })
    ).toBeNull();
    expect(
      resolveAlarmImageFilename({ imageKind: "base64", imageUrl: "/api/alarm-images/a.jpg/../b.jpg" })
    ).toBeNull();
    expect(
      resolveAlarmImageFilename({ imageKind: "base64", imageUrl: "https://evil.test/api/alarm-images/a.jpg" })
    ).toBeNull();
  });

  it("rejects unsupported extensions", () => {
    expect(
      resolveAlarmImageFilename({ imageKind: "base64", imageUrl: "/api/alarm-images/script.js" })
    ).toBeNull();
  });
});

describe("deleteAlarmImageFiles", () => {
  it("removes owned files and tolerates missing ones", async () => {
    const dir = await mkdtemp(join(tmpdir(), "alarm-images-"));
    await writeFile(join(dir, "kept.jpg"), "kept");
    await writeFile(join(dir, "removed.jpg"), "removed");

    await deleteAlarmImageFiles(
      [
        { imageKind: "base64", imageUrl: "/api/alarm-images/removed.jpg" },
        { imageKind: "base64", imageUrl: "/api/alarm-images/never-written.jpg" },
        { imageKind: "aibox-path", imageUrl: "/api/alarm-images/kept.jpg" }
      ],
      dir
    );

    expect(await readdir(dir)).toEqual(["kept.jpg"]);
  });
});
