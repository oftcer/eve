/**
 * Piper TTS — voz feminina pt-BR "Dii"
 * Modelo: https://huggingface.co/OpenVoiceOS/pipertts_pt-BR_dii
 * Licença: CC BY-NC-ND 4.0 (uso pessoal/não comercial)
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { brainDir } from "./brain.js";

const HF_BASE = "https://huggingface.co/OpenVoiceOS/pipertts_pt-BR_dii/resolve/main";
const MODEL_ONNX = "dii_pt-BR.onnx";
const MODEL_JSON = "dii_pt-BR.onnx.json";
/** Attribution: OpenVoiceOS / TigreGotico · CC BY-NC-ND 4.0 · https://huggingface.co/OpenVoiceOS/pipertts_pt-BR_dii */

let readyPromise = null;
let piperBin = null;

function voiceDir() {
  const dir = path.join(brainDir(), "voice", "piper-dii");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true, ...opts });
    let err = "";
    child.stderr?.on("data", (d) => {
      err += d.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(err || `exit ${code}`));
    });
  });
}

async function download(url, dest) {
  if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) return;
  const tmp = `${dest}.part`;
  const withDl = url.includes("?") ? `${url}&download=true` : `${url}?download=true`;
  const res = await fetch(withDl, { redirect: "follow" });
  if (!res.ok) throw new Error(`download ${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  // HuggingFace LFS pointer files are tiny text — reject them
  if (buf.length < 5000 && buf.toString("utf8", 0, 20).includes("version https://git-lfs")) {
    throw new Error("got LFS pointer instead of model file");
  }
  fs.writeFileSync(tmp, buf);
  fs.renameSync(tmp, dest);
}

async function findPiper() {
  const local = path.join(voiceDir(), process.platform === "win32" ? "piper.exe" : "piper");
  if (fs.existsSync(local)) return local;
  const which = process.platform === "win32" ? "where" : "which";
  try {
    const out = await new Promise((resolve) => {
      const child = spawn(which, ["piper"], { windowsHide: true });
      let data = "";
      child.stdout.on("data", (d) => {
        data += d.toString();
      });
      child.on("close", () => resolve(data.trim().split(/\r?\n/)[0] || ""));
    });
    if (out && fs.existsSync(out)) return out;
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Download Windows piper release binary if missing.
 * Falls back to null (caller uses SAPI).
 */
async function ensurePiperBinary() {
  const existing = await findPiper();
  if (existing) return existing;
  if (process.platform !== "win32") return null;

  // Official piper releases: https://github.com/rhasspy/piper/releases
  const zipUrl =
    "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip";
  const dir = voiceDir();
  const zipPath = path.join(dir, "piper_windows_amd64.zip");
  try {
    await download(zipUrl, zipPath);
    await run("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `Expand-Archive -Force -Path '${zipPath.replace(/'/g, "''")}' -DestinationPath '${dir.replace(/'/g, "''")}'`,
    ]);
    const candidates = [
      path.join(dir, "piper", "piper.exe"),
      path.join(dir, "piper.exe"),
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) {
        piperBin = c;
        return c;
      }
    }
    // search recursively
    const walk = (root) => {
      for (const name of fs.readdirSync(root)) {
        const full = path.join(root, name);
        const st = fs.statSync(full);
        if (st.isDirectory()) {
          const hit = walk(full);
          if (hit) return hit;
        } else if (name.toLowerCase() === "piper.exe") return full;
      }
      return null;
    };
    const found = walk(dir);
    if (found) {
      piperBin = found;
      return found;
    }
  } catch {
    return null;
  }
  return null;
}

export async function ensurePiperVoice() {
  if (readyPromise) return readyPromise;
  readyPromise = (async () => {
    const dir = voiceDir();
    const onnx = path.join(dir, MODEL_ONNX);
    const json = path.join(dir, MODEL_JSON);
    await download(`${HF_BASE}/${MODEL_ONNX}`, onnx);
    await download(`${HF_BASE}/${MODEL_JSON}`, json);
    piperBin = await ensurePiperBinary();
    return Boolean(piperBin && fs.existsSync(onnx));
  })();
  return readyPromise;
}

export async function speakPiper(text) {
  const line = String(text || "")
    .replace(/[\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 420);
  if (!line) return false;

  const ok = await ensurePiperVoice().catch(() => false);
  if (!ok || !piperBin) return false;

  const dir = voiceDir();
  const onnx = path.join(dir, MODEL_ONNX);
  const wav = path.join(os.tmpdir(), `eve-piper-${Date.now()}.wav`);

  try {
    await new Promise((resolve, reject) => {
      const child = spawn(piperBin, ["--model", onnx, "--output_file", wav], {
        windowsHide: true,
        stdio: ["pipe", "ignore", "pipe"],
      });
      let err = "";
      child.stderr.on("data", (d) => {
        err += d.toString();
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0 && fs.existsSync(wav)) resolve();
        else reject(new Error(err || `piper ${code}`));
      });
      child.stdin.write(line);
      child.stdin.end();
    });

    await run("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `$p = New-Object System.Media.SoundPlayer '${wav.replace(/'/g, "''")}'; $p.PlaySync()`,
    ]);
    try {
      fs.unlinkSync(wav);
    } catch {
      /* ok */
    }
    return true;
  } catch {
    try {
      fs.unlinkSync(wav);
    } catch {
      /* ok */
    }
    return false;
  }
}

export function piperStatus() {
  const dir = voiceDir();
  return {
    model: fs.existsSync(path.join(dir, MODEL_ONNX)),
    binary: Boolean(piperBin),
    attribution: "Voz Dii · OpenVoiceOS / TigreGotico · CC BY-NC-ND 4.0",
  };
}
