// Vòng đời accessToken EZVIZ. Token sống ~7 ngày; cache trong collection
// `settings` để không gọi token/get mỗi request (EZVIZ có quota gọi).
// Phần quyết định "có nên làm mới không" tách thành hàm thuần để test không
// cần Mongo lẫn mạng.

import { EZVIZ_AREA_DOMAINS, EzvizError, postEzviz } from "@/lib/aibox/ezviz-api";
import { connectMongo } from "@/lib/mongodb";
import { AppSettingModel } from "@/models/app-setting";

export const SETTING_KEY_EZVIZ_APP_KEY = "ezvizAppKey";
export const SETTING_KEY_EZVIZ_APP_SECRET = "ezvizAppSecret";
export const SETTING_KEY_EZVIZ_AREA_DOMAIN = "ezvizAreaDomain";
export const SETTING_KEY_EZVIZ_TOKEN = "ezvizToken";
export const SETTING_KEY_EZVIZ_TOKEN_EXPIRE_AT = "ezvizTokenExpireAt";
export const SETTING_KEY_EZVIZ_RAM_ACCOUNT_ID = "ezvizRamAccountId";
/**
 * Cho phép phát bằng token tài khoản CHÍNH thay vì tài khoản con ("1" = bật).
 *
 * Đây là hạ cấp bảo mật có chủ đích, do người dùng quyết định ngày 14/08/2026:
 * token tài khoản con không giải mã được luồng (`设备已加密`) và EZVIZ không có
 * API đọc lại policy để dò cho đúng. Bật cờ này thì token có quyền trên toàn
 * bộ tài khoản EZVIZ sẽ xuống trình duyệt — ai mở DevTools trên dashboard đều
 * đọc được, dùng lại được trong 7 ngày. Chỉ bật khi dashboard chỉ có người
 * trong nhà dùng.
 */
export const SETTING_KEY_EZVIZ_ALLOW_MAIN_TOKEN = "ezvizAllowMainToken";

/** Làm mới sớm 1 ngày trước hạn để không có cửa sổ token chết giữa hai lần cron. */
const REFRESH_MARGIN_MS = 86_400_000;

export function shouldRefreshToken(
  cached: { token: string; expireAt: number } | null,
  now: number
): boolean {
  if (!cached || !cached.token) return true;
  return cached.expireAt - REFRESH_MARGIN_MS <= now;
}

async function readSettings(keys: string[]): Promise<Map<string, string>> {
  await connectMongo();
  const docs = await AppSettingModel.find({ key: { $in: keys } }).lean<
    { key: string; value: string }[]
  >();
  return new Map(docs.map((d) => [d.key, d.value]));
}

async function writeSetting(key: string, value: string): Promise<void> {
  await AppSettingModel.updateOne({ key }, { $set: { value } }, { upsert: true });
}

interface TokenResponse {
  accessToken: string;
  expireTime: number;
  areaDomain: string;
}

export interface EzvizAuth {
  token: string;
  domain: string;
}

/**
 * Lấy token dùng được. Lần đầu chưa biết region → thử lần lượt các domain đã
 * biết rồi ghim domain thành công vào settings; các lần sau gọi thẳng domain đó.
 */
export async function getEzvizToken(): Promise<EzvizAuth> {
  const settings = await readSettings([
    SETTING_KEY_EZVIZ_APP_KEY,
    SETTING_KEY_EZVIZ_APP_SECRET,
    SETTING_KEY_EZVIZ_AREA_DOMAIN,
    SETTING_KEY_EZVIZ_TOKEN,
    SETTING_KEY_EZVIZ_TOKEN_EXPIRE_AT
  ]);

  const appKey = settings.get(SETTING_KEY_EZVIZ_APP_KEY);
  const appSecret = settings.get(SETTING_KEY_EZVIZ_APP_SECRET);
  if (!appKey || !appSecret) {
    throw new EzvizError("NOT_CONFIGURED", "Chưa cấu hình EZVIZ trong Cài đặt");
  }

  const pinned = settings.get(SETTING_KEY_EZVIZ_AREA_DOMAIN);
  const cached = {
    token: settings.get(SETTING_KEY_EZVIZ_TOKEN) ?? "",
    expireAt: Number(settings.get(SETTING_KEY_EZVIZ_TOKEN_EXPIRE_AT) ?? 0)
  };

  if (pinned && !shouldRefreshToken(cached, Date.now())) {
    return { token: cached.token, domain: pinned };
  }

  const candidates = pinned ? [pinned] : [...EZVIZ_AREA_DOMAINS];
  let lastError: unknown = null;

  for (const domain of candidates) {
    try {
      const data = await postEzviz<TokenResponse>(domain, "/api/lapp/token/get", {
        appKey,
        appSecret
      });
      // token/get trả kèm areaDomain — tin nó hơn domain mình đoán.
      const resolved = data.areaDomain || domain;
      await writeSetting(SETTING_KEY_EZVIZ_AREA_DOMAIN, resolved);
      await writeSetting(SETTING_KEY_EZVIZ_TOKEN, data.accessToken);
      await writeSetting(SETTING_KEY_EZVIZ_TOKEN_EXPIRE_AT, String(data.expireTime));
      return { token: data.accessToken, domain: resolved };
    } catch (e) {
      lastError = e;
      // 10017 = appKey không thuộc region này → thử domain kế tiếp.
      // Lỗi khác (mạng, secret sai) thì dừng luôn, đừng rải request vô ích.
      if (e instanceof EzvizError && e.code === "10017") continue;
      throw e;
    }
  }

  if (lastError instanceof EzvizError && lastError.code === "10017") {
    throw new EzvizError("10017", "AppKey không đúng hoặc không thuộc region nào đã biết");
  }
  throw lastError ?? new EzvizError("UNKNOWN", "Không lấy được token EZVIZ");
}

/** Gặp token hết hạn thì làm mới MỘT lần rồi thử lại — không lặp vô hạn. */
export async function withTokenRetry<T>(fn: (auth: EzvizAuth) => Promise<T>): Promise<T> {
  const auth = await getEzvizToken();
  try {
    return await fn(auth);
  } catch (e) {
    if (!(e instanceof EzvizError) || e.code !== "10002") throw e;
    await writeSetting(SETTING_KEY_EZVIZ_TOKEN, "");
    return fn(await getEzvizToken());
  }
}

/**
 * Token phát cho trình duyệt. Mặc định dùng tài khoản con vì token tài khoản
 * chính có quyền trên toàn bộ tài khoản EZVIZ, lộ ra DevTools là mất trắng.
 * Chưa cấu hình tài khoản con thì TỪ CHỐI — chỉ hạ cấp khi người dùng bật cờ
 * SETTING_KEY_EZVIZ_ALLOW_MAIN_TOKEN một cách tường minh, không bao giờ tự động.
 */
export async function getPlayToken(): Promise<EzvizAuth> {
  const settings = await readSettings([
    SETTING_KEY_EZVIZ_RAM_ACCOUNT_ID,
    SETTING_KEY_EZVIZ_ALLOW_MAIN_TOKEN
  ]);

  if (settings.get(SETTING_KEY_EZVIZ_ALLOW_MAIN_TOKEN) === "1") {
    return getEzvizToken();
  }

  const accountId = settings.get(SETTING_KEY_EZVIZ_RAM_ACCOUNT_ID);
  if (!accountId) {
    throw new EzvizError(
      "NO_SUBACCOUNT",
      "Chưa có tài khoản con EZVIZ, và chưa bật chế độ dùng token tài khoản chính"
    );
  }
  return withTokenRetry(async ({ token, domain }) => {
    const data = await postEzviz<{ accessToken: string; expireTime: number }>(
      domain,
      "/api/lapp/ram/token/get",
      { accessToken: token, accountId }
    );
    return { token: data.accessToken, domain };
  });
}
