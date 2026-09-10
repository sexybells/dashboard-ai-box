import { describe, expect, it } from "vitest";
import { buildFaceIdCountPayload, countVisitPairs, FULL_DAY_WINDOW } from "./headcount-visits";

describe("countVisitPairs", () => {
  it("ghép mỗi In với một Out thành một lượt", () => {
    expect(countVisitPairs([{ camera: "cổng", in: 22, out: 22 }])).toBe(22);
  });

  it("bỏ phần lẻ khi In nhiều hơn Out (khách còn ở trong)", () => {
    // Số thật đo được ngày 30/08 ở camera Tam Quan Nội - Ngoài.
    expect(countVisitPairs([{ camera: "Tam Quan Nội - Ngoài", in: 23, out: 22 }])).toBe(22);
  });

  it("bỏ phần lẻ cả khi Out nhiều hơn In", () => {
    expect(countVisitPairs([{ camera: "sân", in: 28, out: 35 }])).toBe(28);
  });

  it("ghép trong từng camera rồi mới cộng, không gộp In/Out chung", () => {
    const tallies = [
      { camera: "cổng", in: 10, out: 0 },
      { camera: "sân", in: 0, out: 10 }
    ];
    // Gộp trước khi ghép sẽ ra 10 — sai, vì In ở cổng không phải là Out ở sân.
    expect(countVisitPairs(tallies)).toBe(0);
  });

  it("cộng kết quả của nhiều camera", () => {
    expect(
      countVisitPairs([
        { camera: "cổng", in: 23, out: 22 },
        { camera: "sân", in: 20, out: 4 }
      ])
    ).toBe(26);
  });

  it("không có dữ liệu thì bằng 0", () => {
    expect(countVisitPairs([])).toBe(0);
    expect(countVisitPairs([{ camera: "cổng", in: 0, out: 0 }])).toBe(0);
  });
});

describe("buildFaceIdCountPayload", () => {
  const template = {
    AlarmId: "cũ",
    UniqueId: "ALARM_cũ",
    Summary: "HeadCount",
    Time: "2026-08-30 13:00:00",
    TimeStamp: 1,
    ImageData: "/9j/base64...",
    LocalRawPath: "Images/DAY_20260830/IMAGE_x_HeadCount_raw.jpg",
    LocalLabeledPath: "",
    BoardIp: "192.168.100.19",
    Media: { MediaName: "Tam Quan Nội - Ngoài", Params: [{ Key: "GB28181ChannelId" }] },
    SensorData: [],
    Result: { Type: "HeadCount", Properties: [{ property: "Count" }] }
  };

  const built = buildFaceIdCountPayload(template, {
    count: 26,
    timeText: "2026-08-30 15:15:00",
    timestamp: 1788080100000000,
    alarmId: "A-1",
    uniqueId: "ALARM_A-1"
  });

  it("đổi sang FaceIdCount và thay toàn bộ Result", () => {
    expect(built.Summary).toBe("FaceIdCount");
    const result = built.Result as Record<string, unknown>;
    expect(result.Type).toBe("FaceIdCount");
    expect(result.RegType).toBe("Scene");
    expect(result.FaceIdCount).toBe(true);
  });

  it("đặt Count vào khung 00-23 và ghi đúng chuỗi display", () => {
    const result = built.Result as { Properties: { value: unknown; display: string }[] };
    expect(result.Properties[0].value).toEqual([{ Count: 26, End: 23, Start: 0 }]);
    expect(result.Properties[0].display).toBe("00-23：26");
    expect(FULL_DAY_WINDOW).toEqual({ Start: 0, End: 23 });
  });

  it("bỏ ảnh vì FaceIdCount không kèm ảnh", () => {
    expect(built.ImageData).toBeUndefined();
    expect(built.LocalRawPath).toBe("");
    expect(built.LocalLabeledPath).toBe("");
  });

  it("giữ nguyên phần bao ngoài của box", () => {
    expect(built.BoardIp).toBe("192.168.100.19");
    expect(built.Media).toEqual(template.Media);
    expect(built.SensorData).toEqual([]);
  });

  it("gán id và thời gian mới, không dùng lại của bản gốc", () => {
    expect(built.AlarmId).toBe("A-1");
    expect(built.UniqueId).toBe("ALARM_A-1");
    expect(built.Time).toBe("2026-08-30 15:15:00");
    expect(built.TimeStamp).toBe(1788080100000000);
  });

  it("không sửa vào bản gốc truyền vào", () => {
    expect(template.Summary).toBe("HeadCount");
    expect(template.ImageData).toBe("/9j/base64...");
  });
});
