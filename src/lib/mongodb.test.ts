import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";

vi.mock("mongoose", () => ({
  default: { connect: vi.fn() }
}));

const connectSpy = vi.mocked(mongoose.connect);

// Cache kết nối sống trên globalThis nên phải dọn giữa các test, và import lại
// module để mỗi test bắt đầu từ trạng thái sạch.
async function freshConnectMongo() {
  const globalForMongoose = globalThis as typeof globalThis & { mongooseCache?: unknown };
  delete globalForMongoose.mongooseCache;
  vi.resetModules();
  return (await import("./mongodb")).connectMongo;
}

describe("connectMongo", () => {
  beforeEach(() => {
    connectSpy.mockReset();
    process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/test";
  });

  afterEach(() => {
    delete process.env.MONGODB_URI;
  });

  it("dùng lại kết nối đã có thay vì mở kết nối mới", async () => {
    const conn = {} as typeof mongoose;
    connectSpy.mockResolvedValue(conn);
    const connectMongo = await freshConnectMongo();

    await connectMongo();
    await connectMongo();

    expect(connectSpy).toHaveBeenCalledTimes(1);
  });

  it("thử kết nối lại sau khi lần trước thất bại", async () => {
    const conn = {} as typeof mongoose;
    connectSpy.mockRejectedValueOnce(new Error("ECONNREFUSED")).mockResolvedValueOnce(conn);
    const connectMongo = await freshConnectMongo();

    await expect(connectMongo()).rejects.toThrow("ECONNREFUSED");

    // Mongo sống lại: lần gọi sau phải kết nối mới, không await lại promise đã reject.
    await expect(connectMongo()).resolves.toBe(conn);
    expect(connectSpy).toHaveBeenCalledTimes(2);
  });
});
