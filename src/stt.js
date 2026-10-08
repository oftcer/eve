/**
 * STT da EVE
 * 1) OpenAI Whisper (se houver chave)
 * 2) Windows System.Speech
 * 3) Whisper local (Xenova)
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { loadConnections } from "./connections.js";
import { loadProviders } from "./brain.js";

let active = null;
let whisperPipe = null;
let whisperLoading = null;

const DEBUG_DIR = path.join(os.homedir(), ".eve", "voice");

export function cancelListen() {
  if (!active) return;
  try {
    active.kill();
  } catch {
    /* ok */
  }
  active = null;
}

function ensureDebugDir() {
  try {
    fs.mkdirSync(DEBUG_DIR, { recursive: true });
  } catch {
    /* ok */
  }
}

function saveLastWav(buf) {
  try {
    ensureDebugDir();
    fs.writeFileSync(path.join(DEBUG_DIR, "last.wav"), buf);
  } catch {
    /* ok */
  }
}

function wavToFloat32(buf) {
  if (!buf || buf.length < 44) return null;
  const channels = buf.readUInt16LE(22) || 1;
  const sampleRate = buf.readUInt32LE(24) || 16000;
  const bits = buf.readUInt16LE(34);
  if (bits !== 16) return null;

  // encontra chunk "data" (header pode ter extras)
  let offset = 12;
  let dataStart = 44;
  let dataSize = buf.length - 44;
  while (offset + 8 <= buf.length) {
    const id = buf.toString("ascii", offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    if (id === "data") {
      dataStart = offset + 8;
      dataSize = size;
      break;
    }
    offset += 8 + size;
  }

  const frameBytes = 2 * channels;
  const nFrames = Math.floor(Math.max(0, Math.min(dataSize, buf.length - dataStart)) / frameBytes);
  const out = new Float32Array(nFrames);
  let peak = 0;
  for (let i = 0; i < nFrames; i += 1) {
    const at = dataStart + i * frameBytes;
    let sample = 0;
    for (let c = 0; c < channels; c += 1) {
      sample += buf.readInt16LE(at + c * 2) / 32768;
    }
    sample /= channels;
    out[i] = Math.max(-1, Math.min(1, sample));
    peak = Math.max(peak, Math.abs(out[i]));
  }

  // normaliza pro pico ~0.9
  if (peak > 0.0001 && peak < 0.9) {
    const gain = Math.min(25, 0.9 / peak);
    for (let i = 0; i < out.length; i += 1) {
      out[i] = Math.max(-1, Math.min(1, out[i] * gain));
    }
    peak = Math.min(0.9, peak * gain);
  }

  // resample p/ 16k se precisar
  let audio = out;
  let rate = sampleRate;
  if (sampleRate !== 16000 && out.length > 0) {
    const ratio = sampleRate / 16000;
    const len = Math.max(1, Math.floor(out.length / ratio));
    const down = new Float32Array(len);
    for (let i = 0; i < len; i += 1) {
      down[i] = out[Math.min(out.length - 1, Math.floor(i * ratio))];
    }
    audio = down;
    rate = 16000;
  }

  return { audio, sampleRate: rate, peak, secs: audio.length / rate };
}

async function openaiWhisper(wavBuffer, apiKey) {
  const form = new FormData();
  form.append("file", new File([wavBuffer], "eve.wav", { type: "audio/wav" }));
  form.append("model", "whisper-1");
  form.append("language", "pt");
  form.append("response_format", "json");
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI Whisper: ${res.status} ${err.slice(0, 160)}`);
  }
  const data = await res.json();
  return String(data.text || "").trim();
}

async function getWhisper() {
  if (whisperPipe) return whisperPipe;
  if (whisperLoading) return whisperLoading;
  whisperLoading = (async () => {
    const { pipeline } = await import("@xenova/transformers");
    whisperPipe = await pipeline("automatic-speech-recognition", "Xenova/whisper-tiny", {
      quantized: true,
    });
    return whisperPipe;
  })();
  return whisperLoading;
}

function scrub(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .replace(
      /^(thanks for watching\.?|thank you for watching\.?|thank you\.?|legendas? by.*|subscribe.*|you|\[.*\]|\(.*\))$/i,
      "",
    )
    .trim();
}

async function localWhisper(wavBuffer) {
  const parsed = wavToFloat32(wavBuffer);
  if (!parsed?.audio?.length || parsed.secs < 0.2) return "";
  const pipe = await getWhisper();

  // 1ª tentativa: português
  let result = await pipe(
    { array: parsed.audio, sampling_rate: parsed.sampleRate },
    {
      language: "portuguese",
      task: "transcribe",
      chunk_length_s: 30,
      no_speech_threshold: 0.05,
      logprob_threshold: -1.5,
      compression_ratio_threshold: 3.0,
      condition_on_previous_text: false,
    },
  );
  let text = scrub(result?.text);
  if (text) return text;

  // 2ª: sem idioma forçado (às vezes tiny erra com pt)
  result = await pipe(
    { array: parsed.audio, sampling_rate: parsed.sampleRate },
    {
      task: "transcribe",
      chunk_length_s: 30,
      no_speech_threshold: 0.01,
      condition_on_previous_text: false,
    },
  );
  return scrub(result?.text);
}

function runPowershell(script, timeoutMs = 22000) {
  return new Promise((resolve) => {
    cancelListen();
    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
      { windowsHide: true },
    );
    active = child;
    let out = "";
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        /* ok */
      }
    }, timeoutMs);
    child.stdout.on("data", (d) => {
      out += d.toString("utf8");
    });
    child.on("close", () => {
      clearTimeout(timer);
      if (active === child) active = null;
      resolve(out.trim());
    });
    child.on("error", () => {
      clearTimeout(timer);
      if (active === child) active = null;
      resolve("");
    });
  });
}

async function windowsSapi(wavBuffer) {
  if (process.platform !== "win32") return "";
  const file = path.join(os.tmpdir(), `eve-stt-${Date.now()}.wav`);
  fs.writeFileSync(file, wavBuffer);
  const safe = file.replace(/'/g, "''");
  const script = `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Speech
$engine = $null
foreach ($name in @('pt-BR','pt-PT','en-US')) {
  try {
    $ci = [System.Globalization.CultureInfo]::GetCultureInfo($name)
    $engine = New-Object System.Speech.Recognition.SpeechRecognitionEngine $ci
    if ($engine) { break }
  } catch {}
}
if (-not $engine) { exit 0 }
try {
  $engine.SetInputToWaveFile('${safe}')
  $engine.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar))
  $engine.BabbleTimeout = [TimeSpan]::FromSeconds(0)
  $engine.InitialSilenceTimeout = [TimeSpan]::FromSeconds(0)
  $engine.EndSilenceTimeout = [TimeSpan]::FromSeconds(0.4)
  $result = $engine.Recognize([TimeSpan]::FromSeconds(12))
  if ($result -and $result.Text) { [Console]::Out.Write(($result.Text).Trim()) }
} finally {
  if ($engine) { $engine.Dispose() }
}
`;
  try {
    return (await runPowershell(script, 18000)) || "";
  } finally {
    try {
      fs.unlinkSync(file);
    } catch {
      /* ok */
    }
  }
}

function openaiKeyFromConfig() {
  try {
    const conn = loadConnections(loadProviders());
    if (conn.chatgpt?.apiKey) return String(conn.chatgpt.apiKey).trim();
  } catch {
    /* ok */
  }
  return process.env.OPENAI_API_KEY || "";
}

/**
 * @param {Buffer} wavBuffer
 */
export async function recognizeWav(wavBuffer) {
  if (!wavBuffer || wavBuffer.length < 800) {
    return { text: "", engine: "none", error: "Áudio curto demais." };
  }

  saveLastWav(wavBuffer);
  const meta = wavToFloat32(wavBuffer);
  const peakInfo = meta ? `peak=${meta.peak.toFixed(3)} ${meta.secs.toFixed(1)}s` : "wav-invalid";

  const key = openaiKeyFromConfig();
  if (key) {
    try {
      const text = scrub(await openaiWhisper(wavBuffer, key));
      if (text) return { text, engine: "openai-whisper", detail: peakInfo };
    } catch (e) {
      /* continua */
    }
  }

  // Windows SAPI antes do whisper local (mais rápido quando idioma instalado)
  try {
    const sapi = scrub(await windowsSapi(wavBuffer));
    if (sapi) return { text: sapi, engine: "windows-sapi", detail: peakInfo };
  } catch {
    /* ok */
  }

  try {
    if (meta && meta.peak < 0.001) {
      return {
        text: "",
        engine: "none",
        error: `Mic mudo (${peakInfo}). Fale mais perto.`,
      };
    }
    const text = await localWhisper(wavBuffer);
    if (text) return { text, engine: "whisper-local", detail: peakInfo };
    return {
      text: "",
      engine: "whisper-local",
      error: `Não entendi (${peakInfo}). Fale de novo, mais claro.`,
    };
  } catch (error) {
    const msg = error?.message || String(error);
    return {
      text: "",
      engine: "none",
      error: /Cannot find package|ERR_MODULE/i.test(msg)
        ? "Whisper ausente. Rode npm install."
        : `Falha STT: ${msg.slice(0, 140)}`,
    };
  }
}

export async function listenOnce() {
  return { text: "", engine: "none", error: "Use o mic da tela." };
}

export function warmupStt() {
  if (!process.env.ORT_LOG_SEVERITY_LEVEL) process.env.ORT_LOG_SEVERITY_LEVEL = "3";
  getWhisper().catch(() => {});
}
