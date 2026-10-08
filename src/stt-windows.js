/**
 * STT nativo Windows (System.Speech) a partir de WAV PCM.
 * Grava no front (MediaRecorder/WAV) e reconhece no Node — evita
 * conflito de microfone exclusivo com o Electron.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

let active = null;

export function cancelListen() {
  if (!active) return;
  try {
    active.kill();
  } catch {
    /* ok */
  }
  active = null;
}

function runPowershell(script, timeoutMs = 25000) {
  return new Promise((resolve, reject) => {
    cancelListen();
    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
      { windowsHide: true },
    );
    active = child;
    let out = "";
    let err = "";
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
    child.stderr.on("data", (d) => {
      err += d.toString("utf8");
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      if (active === child) active = null;
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (active === child) active = null;
      resolve({ code, out: out.trim(), err: err.trim() });
    });
  });
}

/**
 * Reconhece fala em um buffer WAV (PCM 16-bit mono/stereo).
 * @param {Buffer} wavBuffer
 */
export async function recognizeWav(wavBuffer) {
  if (process.platform !== "win32") {
    throw new Error("STT nativo só no Windows");
  }
  if (!wavBuffer || wavBuffer.length < 1000) {
    return { text: "", engine: "windows-sapi" };
  }

  const file = path.join(os.tmpdir(), `eve-stt-${Date.now()}.wav`);
  fs.writeFileSync(file, wavBuffer);

  const safe = file.replace(/'/g, "''");
  const script = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$engine = $null
foreach ($name in @('pt-BR','pt-PT','en-US')) {
  try {
    $ci = [System.Globalization.CultureInfo]::GetCultureInfo($name)
    $engine = New-Object System.Speech.Recognition.SpeechRecognitionEngine $ci
    break
  } catch {}
}
if (-not $engine) { $engine = New-Object System.Speech.Recognition.SpeechRecognitionEngine }
try {
  $engine.SetInputToWaveFile('${safe}')
  $grammar = New-Object System.Speech.Recognition.DictationGrammar
  $engine.LoadGrammar($grammar)
  $engine.InitialSilenceTimeout = [TimeSpan]::FromSeconds(1)
  $engine.BabbleTimeout = [TimeSpan]::FromSeconds(4)
  $engine.EndSilenceTimeout = [TimeSpan]::FromSeconds(0.8)
  $result = $engine.Recognize()
  if ($result -and $result.Text) { [Console]::Out.Write(($result.Text).Trim()) }
} finally {
  if ($engine) { $engine.Dispose() }
}
`;

  try {
    const { out, err, code } = await runPowershell(script, 30000);
    if (code && code !== 0 && !out) {
      throw new Error(err || `STT exit ${code}`);
    }
    return { text: out || "", engine: "windows-sapi" };
  } finally {
    try {
      fs.unlinkSync(file);
    } catch {
      /* ok */
    }
  }
}

/**
 * Fallback: escuta ao vivo no device padrão (se nada estiver segurando o mic).
 */
export async function listenOnce({ timeoutMs = 20000 } = {}) {
  if (process.platform !== "win32") {
    throw new Error("STT nativo só no Windows");
  }

  const script = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$engine = $null
foreach ($name in @('pt-BR','pt-PT','en-US')) {
  try {
    $ci = [System.Globalization.CultureInfo]::GetCultureInfo($name)
    $engine = New-Object System.Speech.Recognition.SpeechRecognitionEngine $ci
    break
  } catch {}
}
if (-not $engine) { $engine = New-Object System.Speech.Recognition.SpeechRecognitionEngine }
try {
  $engine.SetInputToDefaultAudioDevice()
} catch {
  [Console]::Error.WriteLine('MIC_BUSY')
  exit 2
}
$engine.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar))
$engine.InitialSilenceTimeout = [TimeSpan]::FromSeconds(10)
$engine.BabbleTimeout = [TimeSpan]::FromSeconds(5)
$engine.EndSilenceTimeout = [TimeSpan]::FromSeconds(1.3)
try {
  $result = $engine.Recognize()
  if ($result -and $result.Text) { [Console]::Out.Write(($result.Text).Trim()) }
} finally {
  $engine.Dispose()
}
`;

  const { out, err, code } = await runPowershell(script, timeoutMs);
  if (code === 2 || /MIC_BUSY/i.test(err)) {
    throw new Error("Microfone ocupado. Feche o teste de áudio e tente de novo.");
  }
  return { text: out || "", engine: "windows-sapi-live" };
}
