import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DIR = path.join(os.homedir(), ".eve");

export function brainDir() {
  fs.mkdirSync(DIR, { recursive: true });
  return DIR;
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), "utf8");
  fs.renameSync(tmp, file);
}

export function configPath() {
  return path.join(brainDir(), "config.json");
}

export function memoryPath() {
  return path.join(brainDir(), "brain.json");
}

export function defaultConfig() {
  return {
    model: "composer-2.5",
    cwd: null,
    voice: true,
    screen: true,
    agentId: null,
    primed: false,
    providers: {
      cursor: { enabled: true, linked: false },
      claude: { enabled: false, apiKey: "" },
      chatgpt: { enabled: false, apiKey: "" },
    },
  };
}

export function providersPath() {
  return path.join(brainDir(), "providers.json");
}

export function loadProviders(config) {
  const fromFile = readJson(providersPath(), null);
  const base = defaultConfig().providers;
  const fromConfig = config?.providers && typeof config.providers === "object" ? config.providers : {};
  const merged = {
    cursor: { ...base.cursor, ...(fromConfig.cursor || {}), ...(fromFile?.cursor || {}) },
    claude: { ...base.claude, ...(fromConfig.claude || {}), ...(fromFile?.claude || {}) },
    chatgpt: { ...base.chatgpt, ...(fromConfig.chatgpt || {}), ...(fromFile?.chatgpt || {}) },
  };
  return merged;
}

export function saveProviders(providers) {
  writeJson(providersPath(), {
    cursor: { enabled: Boolean(providers.cursor?.enabled), linked: Boolean(providers.cursor?.linked) },
    claude: {
      enabled: Boolean(providers.claude?.enabled),
      apiKey: String(providers.claude?.apiKey || "").slice(0, 200),
    },
    chatgpt: {
      enabled: Boolean(providers.chatgpt?.enabled),
      apiKey: String(providers.chatgpt?.apiKey || "").slice(0, 200),
    },
  });
}

export function audioPath() {
  return path.join(brainDir(), "audio.json");
}

export function defaultAudio() {
  return {
    inputId: "",
    outputId: "",
    noiseSuppression: true,
    echoCancellation: true,
    autoGainControl: true,
    gain: 1,
  };
}

export function loadAudio() {
  return { ...defaultAudio(), ...readJson(audioPath(), {}) };
}

export function saveAudio(audio) {
  writeJson(audioPath(), {
    inputId: String(audio?.inputId || "").slice(0, 200),
    outputId: String(audio?.outputId || "").slice(0, 200),
    noiseSuppression: audio?.noiseSuppression !== false,
    echoCancellation: audio?.echoCancellation !== false,
    autoGainControl: audio?.autoGainControl !== false,
    gain: Math.min(2, Math.max(0.5, Number(audio?.gain) || 1)),
  });
}

export function loadConfig() {
  return { ...defaultConfig(), ...readJson(configPath(), {}) };
}

export function saveConfig(config) {
  writeJson(configPath(), config);
}

export function loadBrain() {
  const data = readJson(memoryPath(), null);
  if (!data || typeof data !== "object") {
    return { facts: [], history: [] };
  }
  return {
    facts: Array.isArray(data.facts) ? data.facts : [],
    history: Array.isArray(data.history) ? data.history : [],
  };
}

export function saveBrain(brain) {
  writeJson(memoryPath(), {
    facts: brain.facts.slice(-80),
    history: brain.history.slice(-40),
  });
}

export function addFact(brain, text) {
  const clean = String(text || "").trim();
  if (!clean) return false;
  brain.facts.push({ text: clean.slice(0, 500), at: new Date().toISOString() });
  saveBrain(brain);
  return true;
}

export function addTurn(brain, role, text) {
  const clean = String(text || "").trim();
  if (!clean) return;
  brain.history.push({
    role,
    text: clean.slice(0, 4000),
    at: new Date().toISOString(),
  });
  if (brain.history.length > 40) brain.history.splice(0, brain.history.length - 40);
  saveBrain(brain);
}

export function memoryBlock(brain) {
  if (!brain.facts.length) return "";
  const lines = brain.facts.slice(-12).map((fact) => `- ${fact.text}`);
  return `Memórias que a EVE guardou sobre esta pessoa:\n${lines.join("\n")}\n\n`;
}
