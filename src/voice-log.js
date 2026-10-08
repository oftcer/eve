import fs from "node:fs";
import path from "node:path";
import { brainDir } from "./brain.js";

export function voiceLogPath() {
  return path.join(brainDir(), "voice-log.jsonl");
}

/** Guarda pedidos de voz fora do chat visual */
export function appendVoiceLog(text) {
  const line = JSON.stringify({
    at: new Date().toISOString(),
    text: String(text || "").trim().slice(0, 4000),
  });
  if (!line || line === '{"at":') return;
  fs.appendFileSync(voiceLogPath(), `${line}\n`, "utf8");
}
