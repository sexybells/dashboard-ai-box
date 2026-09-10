// Strips network addresses out of AI Box payloads before they leave the server.
// The box embeds camera credentials directly in the stream url
// (rtsp://user:pass@host:port/...), so hiding these fields in the markup is not
// enough — the value would still ship inside the page's serialized props.
// Redaction is by value, not by key name, so a new field carrying an address is
// covered without updating a list here.

export const REDACTED = "[đã ẩn]";

const IPV4 = /(?:\d{1,3}\.){3}\d{1,3}/;
const STREAM_URL = /^\s*(?:rtsp|rtsps|rtmp|rtmps):\/\//i;

function isSensitiveText(value: string): boolean {
  return STREAM_URL.test(value) || IPV4.test(value);
}

/** Deep copy of `value` with every address-bearing string replaced. */
export function redactSensitive<T>(value: T): T {
  if (typeof value === "string") {
    return (isSensitiveText(value) ? REDACTED : value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactSensitive(item)) as T;
  }

  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = redactSensitive(item);
    }
    return out as T;
  }

  return value;
}
