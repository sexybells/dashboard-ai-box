// Dump the most recent raw AI Box webhook payloads for inspection.
//
// Purpose: confirm whether the SE5 Face Capture event carries a face
// feature/embedding (and expose track_id / channel_id shape) so the in↔out
// matching backend can be designed against the real contract, not a guess.
//
// Usage:
//   MONGODB_URI="<cloud uri>" node scripts/dump-latest-webhook.mjs [limit]
//   node scripts/dump-latest-webhook.mjs 3        # reads MONGODB_URI from env/.env.local
//
// The connection string is read from the environment only; it is never printed.
// Long strings (base64 images) are truncated so real payload fields stay readable.

import mongoose from "mongoose";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadUri() {
  if (process.env.MONGODB_URI) return process.env.MONGODB_URI;
  // Fallback: read MONGODB_URI from .env.local without extra deps.
  try {
    const env = readFileSync(join(__dirname, "..", ".env.local"), "utf8");
    const line = env.split(/\r?\n/).find((l) => l.startsWith("MONGODB_URI="));
    if (line) return line.slice("MONGODB_URI=".length).trim().replace(/^["']|["']$/g, "");
  } catch {
    /* ignore */
  }
  return undefined;
}

// Recursively shorten long strings (base64 images) and collect keys whose name
// hints at a face feature vector, so we can eyeball whether the box sends one.
const FEATURE_KEY = /feat|embed|vector|descriptor|人脸特征|特征/i;
const featureHits = [];

function summarize(value, path = "") {
  if (typeof value === "string") {
    return value.length > 180 ? `«string ${value.length} chars: ${value.slice(0, 40)}…»` : value;
  }
  if (Array.isArray(value)) {
    if (path && FEATURE_KEY.test(path)) featureHits.push(`${path} → array[${value.length}]`);
    return value.length > 12
      ? [...value.slice(0, 12).map((v, i) => summarize(v, `${path}[${i}]`)), `…(+${value.length - 12} more)`]
      : value.map((v, i) => summarize(v, `${path}[${i}]`));
  }
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const childPath = path ? `${path}.${k}` : k;
      if (FEATURE_KEY.test(k)) {
        const kind = Array.isArray(v) ? `array[${v.length}]` : typeof v;
        featureHits.push(`${childPath} → ${kind}`);
      }
      out[k] = summarize(v, childPath);
    }
    return out;
  }
  return value;
}

async function main() {
  const uri = loadUri();
  if (!uri) {
    console.error("✗ MONGODB_URI not set. Run: MONGODB_URI='<cloud uri>' node scripts/dump-latest-webhook.mjs");
    process.exit(1);
  }
  const limit = Math.max(1, Number(process.argv[2]) || 5);

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  const db = mongoose.connection.db;

  const total = await db.collection("webhook_events").countDocuments();
  const docs = await db
    .collection("webhook_events")
    .find({}, { sort: { receivedAt: -1 }, limit })
    .toArray();

  console.log(`\nwebhook_events total: ${total}. Showing latest ${docs.length}:\n`);
  docs.forEach((doc, i) => {
    console.log(`──────── #${i + 1}  receivedAt=${doc.receivedAt?.toISOString?.() ?? doc.receivedAt}  hash=${doc.payloadHash}`);
    console.log(`top-level keys: ${Object.keys(doc.payload ?? {}).join(", ")}`);
    console.log(JSON.stringify(summarize(doc.payload), null, 2));
    console.log("");
  });

  console.log("──────── feature/embedding key scan ────────");
  console.log(featureHits.length ? [...new Set(featureHits)].join("\n") : "(no keys matching feat|embed|vector|descriptor|特征)");
  console.log("→ If empty, the box likely sends image-only → backend must run its own ArcFace/InsightFace.\n");

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error("✗", err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
