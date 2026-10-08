import fs from "node:fs";
import path from "node:path";
import { brainDir } from "./brain.js";

const MAX_MEMORY = 300;
const memory = [];

function logPath() {
  return path.join(brainDir(), "activity.jsonl");
}

export function logActivity(entry) {
  const row = {
    at: new Date().toISOString(),
    level: entry.level || (entry.ok === false ? "error" : "info"),
    kind: entry.kind || "event",
    provider: String(entry.provider || ""),
    method: String(entry.method || ""),
    path: String(entry.path || ""),
    status: entry.status ?? null,
    ok: entry.ok === undefined ? null : Boolean(entry.ok),
    message: String(entry.message || "").slice(0, 500),
    detail: String(entry.detail || "").slice(0, 4000),
  };
  memory.push(row);
  if (memory.length > MAX_MEMORY) memory.splice(0, memory.length - MAX_MEMORY);
  try {
    fs.mkdirSync(path.dirname(logPath()), { recursive: true });
    fs.appendFileSync(logPath(), `${JSON.stringify(row)}\n`, "utf8");
  } catch {
    /* ok */
  }
  return row;
}

function readDisk(limit) {
  try {
    const raw = fs.readFileSync(logPath(), "utf8");
    return raw
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(-limit)
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

export function listActivity(limit = 80, provider = "") {
  const n = Math.max(1, Math.min(300, Number(limit) || 80));
  const disk = readDisk(n * 2);
  const merged = [...disk, ...memory];
  // dedupe by at+message+path
  const seen = new Set();
  const rows = [];
  for (let i = merged.length - 1; i >= 0; i -= 1) {
    const r = merged[i];
    const key = `${r.at}|${r.method}|${r.path}|${r.message}|${r.status}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(r);
  }
  let out = rows;
  if (provider) {
    const p = String(provider).toLowerCase();
    out = rows.filter((r) => String(r.provider || "").toLowerCase() === p);
  }
  return out.slice(0, n);
}
