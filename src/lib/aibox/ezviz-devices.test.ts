import { describe, expect, it } from "vitest";
import {
  buildEzopenUrl,
  clipsToRanges,
  dateToMs,
  formatEzopenTime,
  mergeDeviceList,
  msToDate
} from "./ezviz-devices";

describe("mergeDeviceList", () => {
  it("ghép device với channel để biết kênh nào bật mã hoá", () => {
    const out = mergeDeviceList(
      [{ deviceSerial: "BE4583385", deviceName: "H6C", status: 1, model: "CS-H6c" }],
      [{ deviceSerial: "BE4583385", channelNo: 1, isEncrypt: 1 }]
    );
    expect(out).toEqual([
      { serial: "BE4583385", channel: 1, name: "H6C", online: true, encrypted: true }
    ]);
  });

  it("device không có channel vẫn ra kênh 1 mặc định", () => {
    const out = mergeDeviceList([{ deviceSerial: "X1", deviceName: "Cam", status: 0 }], []);
    expect(out).toEqual([
      { serial: "X1", channel: 1, name: "Cam", online: false, encrypted: false }
    ]);
  });

  it("device nhiều kênh sinh nhiều dòng", () => {
    const out = mergeDeviceList(
      [{ deviceSerial: "N1", deviceName: "NVR", status: 1 }],
      [
        { deviceSerial: "N1", channelNo: 1, isEncrypt: 0 },
        { deviceSerial: "N1", channelNo: 2, isEncrypt: 1 }
      ]
    );
    expect(out).toHaveLength(2);
    expect(out[1]).toEqual({
      serial: "N1",
      channel: 2,
      name: "NVR",
      online: true,
      encrypted: true
    });
  });

  it("không nhặt nhầm kênh của device khác", () => {
    const out = mergeDeviceList(
      [{ deviceSerial: "A", deviceName: "CamA", status: 1 }],
      [{ deviceSerial: "B", channelNo: 7, isEncrypt: 1 }]
    );
    expect(out).toEqual([
      { serial: "A", channel: 1, name: "CamA", online: true, encrypted: false }
    ]);
  });
});

describe("buildEzopenUrl", () => {
  // Host trong URL ezopen là open.ezviz.com, KHÁC domain API của region.
  it("dựng URL live chất lượng cao", () => {
    expect(buildEzopenUrl({ serial: "BE4583385", channel: 1, kind: "live", hd: true })).toBe(
      "ezopen://open.ezviz.com/BE4583385/1.hd.live"
    );
  });

  it("live thường không gắn hậu tố hd", () => {
    expect(buildEzopenUrl({ serial: "X1", channel: 1, kind: "live" })).toBe(
      "ezopen://open.ezviz.com/X1/1.live"
    );
  });

  // Mã xác minh đi qua tuỳ chọn validCode của EZUIKit, không nằm trong URL —
  // nhét vào URL thì player báo "ezopen协议格式有误".
  it("không bao giờ nhúng mã xác minh vào URL", () => {
    const url = buildEzopenUrl({ serial: "X1", channel: 1, kind: "live" });
    expect(url).not.toContain("@");
  });

  it("xem lại từ cloud dùng .cloud.rec", () => {
    expect(buildEzopenUrl({ serial: "X1", channel: 2, kind: "rec", cloud: true })).toBe(
      "ezopen://open.ezviz.com/X1/2.cloud.rec"
    );
  });

  it("xem lại từ thẻ nhớ dùng .rec, và hd không ảnh hưởng", () => {
    expect(buildEzopenUrl({ serial: "X1", channel: 2, kind: "rec", hd: true })).toBe(
      "ezopen://open.ezviz.com/X1/2.rec"
    );
  });

  it("xem lại kèm mốc bắt đầu", () => {
    const begin = new Date(2026, 7, 14, 9, 5, 3);
    expect(buildEzopenUrl({ serial: "X1", channel: 1, kind: "rec", cloud: true, begin })).toBe(
      "ezopen://open.ezviz.com/X1/1.cloud.rec?begin=20260814090503"
    );
  });

  it("live bỏ qua mốc bắt đầu", () => {
    const begin = new Date(2026, 7, 14, 9, 5, 3);
    expect(buildEzopenUrl({ serial: "X1", channel: 1, kind: "live", begin })).not.toContain("begin");
  });
});

describe("formatEzopenTime", () => {
  it("đệm 0 đủ hai chữ số cho mọi thành phần", () => {
    expect(formatEzopenTime(new Date(2026, 0, 2, 3, 4, 5))).toBe("20260102030405");
  });
});

describe("msToDate / dateToMs", () => {
  it("đi và về không đổi giá trị", () => {
    expect(dateToMs(msToDate(1786695900000))).toBe(1786695900000);
  });
});

describe("clipsToRanges", () => {
  it("gộp clip sát nhau thành một khoảng", () => {
    const out = clipsToRanges([
      { startTime: 1_000_000, endTime: 1_060_000 },
      { startTime: 1_090_000, endTime: 1_120_000 }
    ]);
    expect(out).toHaveLength(1);
    expect(dateToMs(out[0].end)).toBe(1_120_000);
  });

  it("giữ riêng clip cách nhau xa", () => {
    const out = clipsToRanges([
      { startTime: 1_000_000, endTime: 1_060_000 },
      { startTime: 5_000_000, endTime: 5_060_000 }
    ]);
    expect(out).toHaveLength(2);
  });

  it("bỏ clip có thời lượng âm hoặc không hợp lệ", () => {
    expect(clipsToRanges([{ startTime: 5, endTime: 1 }])).toEqual([]);
    expect(clipsToRanges([{ startTime: Number.NaN, endTime: 10 }])).toEqual([]);
  });

  it("sắp xếp lại clip đến không đúng thứ tự", () => {
    const out = clipsToRanges([
      { startTime: 5_000_000, endTime: 5_060_000 },
      { startTime: 1_000_000, endTime: 1_060_000 }
    ]);
    expect(dateToMs(out[0].start)).toBe(1_000_000);
  });
});
