import { spawn } from "node:child_process";
import { speakPiper, ensurePiperVoice } from "./voice-piper.js";

const queue = [];
let speaking = false;
let currentChild = null;
let piperOk = null;

function clean(text) {
  return String(text || "")
    .replace(/[\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 420);
}

function runSapi(text) {
  return new Promise((resolve) => {
    if (process.platform !== "win32") {
      resolve();
      return;
    }
    const script = `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$s.Rate = -2
$s.Volume = 100
$preferred = @(
  'Microsoft Francisca Online (Natural) - Portuguese (Brazil)',
  'Microsoft Thalita Online (Natural) - Portuguese (Brazil)',
  'Microsoft Maria Online (Natural) - Portuguese (Brazil)',
  'Microsoft Maria Desktop',
  'Microsoft Zira Desktop'
)
$voices = @($s.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo })
$pick = $null
foreach ($name in $preferred) {
  $hit = $voices | Where-Object { $_.Name -eq $name } | Select-Object -First 1
  if ($hit) { $pick = $hit; break }
}
if (-not $pick) { $pick = $voices | Where-Object { $_.Gender -eq 'Female' } | Select-Object -First 1 }
if ($pick) { $s.SelectVoice($pick.Name) }
$s.Speak([string]$env:EVE_SAY)
`;
    currentChild = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
      windowsHide: true,
      env: { ...process.env, EVE_SAY: text },
    });
    currentChild.on("error", () => resolve());
    currentChild.on("close", () => {
      currentChild = null;
      resolve();
    });
  });
}

async function runSpeak(text) {
  if (piperOk === null) {
    piperOk = await ensurePiperVoice().catch(() => false);
  }
  if (piperOk) {
    const ok = await speakPiper(text);
    if (ok) return;
    piperOk = false;
  }
  await runSapi(text);
}

let onSpeakIdle = null;

export function setSpeakIdleHandler(fn) {
  onSpeakIdle = typeof fn === "function" ? fn : null;
}

async function pump() {
  if (speaking) return;
  speaking = true;
  try {
    while (queue.length) {
      const text = queue.shift();
      await runSpeak(text);
    }
  } finally {
    speaking = false;
    try {
      onSpeakIdle?.();
    } catch {
      /* ok */
    }
  }
}

export function speak(text) {
  const line = clean(text);
  if (!line) return;
  queue.push(line);
  if (queue.length > 4) queue.splice(0, queue.length - 4);
  pump();
}

export function stopSpeaking() {
  queue.length = 0;
  if (currentChild && !currentChild.killed) {
    try {
      currentChild.kill();
    } catch {
      /* ok */
    }
    currentChild = null;
  }
  speaking = false;
  try {
    onSpeakIdle?.();
  } catch {
    /* ok */
  }
}

export function speakingNow() {
  return speaking || queue.length > 0;
}

/** Prefetch Piper model in background */
export function warmupVoice() {
  ensurePiperVoice()
    .then((ok) => {
      piperOk = ok;
    })
    .catch(() => {
      piperOk = false;
    });
}
