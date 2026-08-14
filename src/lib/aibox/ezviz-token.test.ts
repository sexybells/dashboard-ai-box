import { describe, expect, it } from "vitest";
import { shouldRefreshToken } from "./ezviz-token";

const NOW = 1_787_000_000_000;
const DAY = 86_400_000;

describe("shouldRefreshToken", () => {
  it("chưa có cache thì phải lấy mới", () => {
    expect(shouldRefreshToken(null, NOW)).toBe(true);
  });

  it("còn hạn dài thì dùng lại", () => {
    expect(shouldRefreshToken({ token: "t", expireAt: NOW + 5 * DAY }, NOW)).toBe(false);
  });

  // Làm mới sớm 1 ngày để không có cửa sổ token chết giữa hai lần cron.
  it("còn dưới 1 ngày thì làm mới sớm", () => {
    expect(shouldRefreshToken({ token: "t", expireAt: NOW + DAY / 2 }, NOW)).toBe(true);
  });

  it("đúng mốc biên 1 ngày cũng làm mới", () => {
    expect(shouldRefreshToken({ token: "t", expireAt: NOW + DAY }, NOW)).toBe(true);
  });

  it("đã hết hạn thì làm mới", () => {
    expect(shouldRefreshToken({ token: "t", expireAt: NOW - 1 }, NOW)).toBe(true);
  });

  it("token rỗng coi như không có dù hạn còn dài", () => {
    expect(shouldRefreshToken({ token: "", expireAt: NOW + 5 * DAY }, NOW)).toBe(true);
  });
});
