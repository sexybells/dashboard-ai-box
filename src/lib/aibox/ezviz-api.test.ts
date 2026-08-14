import { describe, expect, it } from "vitest";
import { EzvizError, ezvizErrorMessage, parseEzvizBody } from "./ezviz-api";

describe("parseEzvizBody", () => {
  it("đọc được response thành công", () => {
    const r = parseEzvizBody('{"code":"200","msg":"Operation succeeded","data":[]}');
    expect(r.code).toBe("200");
    expect(r.data).toEqual([]);
  });

  it("giữ nguyên mã lỗi EZVIZ để tầng trên xử lý", () => {
    const r = parseEzvizBody('{"msg":"AccessToken expired or error.","code":"10002"}');
    expect(r.code).toBe("10002");
    expect(r.msg).toBe("AccessToken expired or error.");
  });

  // Đã gặp thật: gọi sai endpoint, EZVIZ trả trang lỗi Tomcat chứ không phải JSON.
  it("ném EzvizError khi thân không phải JSON", () => {
    expect(() => parseEzvizBody("<!DOCTYPE html><html><head><title>Apache Tomcat")).toThrow(
      EzvizError
    );
    try {
      parseEzvizBody("<!DOCTYPE html>");
      expect.unreachable();
    } catch (e) {
      expect((e as EzvizError).code).toBe("INVALID_RESPONSE");
    }
  });

  it("ném EzvizError khi JSON hợp lệ nhưng không có code", () => {
    expect(() => parseEzvizBody('{"foo":1}')).toThrow(EzvizError);
  });
});

describe("ezvizErrorMessage", () => {
  it("mã đã biết ra thông điệp tiếng Việt riêng", () => {
    expect(ezvizErrorMessage("60019")).toContain("mã xác minh");
    expect(ezvizErrorMessage("10017")).toContain("Cài đặt");
  });

  it("mã lạ ra thông điệp chung, không lộ chi tiết EZVIZ", () => {
    expect(ezvizErrorMessage("99999")).toBe("Không kết nối được EZVIZ");
  });
});
