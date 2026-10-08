import { brainDir } from "./brain.js";
import fs from "node:fs";
import path from "node:path";

function connectionsPath() {
  return path.join(brainDir(), "connections.json");
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

export function defaultConnections() {
  return {
    cursor: { enabled: true, linked: false, email: "", apiKey: "" },
    claude: {
      enabled: false,
      apiKey: "",
      baseUrl: "https://api.anthropic.com",
      model: "claude-sonnet-4-20250514",
    },
    chatgpt: {
      enabled: false,
      apiKey: "",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o-mini",
    },
    github: { enabled: false, token: "", user: "" },
    instagram: { enabled: false, username: "", notes: "" },
    tiktok: { enabled: false, username: "", notes: "" },
  };
}

export function loadConnections(providers) {
  const base = defaultConnections();
  const fromFile = readJson(connectionsPath(), {});
  // merge legacy providers.json shape
  return {
    cursor: {
      ...base.cursor,
      ...(providers?.cursor || {}),
      ...(fromFile.cursor || {}),
    },
    claude: { ...base.claude, ...(providers?.claude || {}), ...(fromFile.claude || {}) },
    chatgpt: { ...base.chatgpt, ...(providers?.chatgpt || {}), ...(fromFile.chatgpt || {}) },
    github: { ...base.github, ...(fromFile.github || {}) },
    instagram: { ...base.instagram, ...(fromFile.instagram || {}) },
    tiktok: { ...base.tiktok, ...(fromFile.tiktok || {}) },
  };
}

export function saveConnections(conn) {
  writeJson(connectionsPath(), {
    cursor: {
      enabled: Boolean(conn.cursor?.enabled),
      linked: Boolean(conn.cursor?.linked),
      email: String(conn.cursor?.email || "").slice(0, 120),
      apiKey: String(conn.cursor?.apiKey || "").slice(0, 200),
    },
    claude: {
      enabled: Boolean(conn.claude?.enabled),
      apiKey: String(conn.claude?.apiKey || "").slice(0, 200),
      baseUrl: String(conn.claude?.baseUrl || "https://api.anthropic.com").slice(0, 200),
      model: String(conn.claude?.model || "claude-sonnet-4-20250514").slice(0, 80),
    },
    chatgpt: {
      enabled: Boolean(conn.chatgpt?.enabled),
      apiKey: String(conn.chatgpt?.apiKey || "").slice(0, 200),
      baseUrl: String(conn.chatgpt?.baseUrl || "https://api.openai.com/v1").slice(0, 200),
      model: String(conn.chatgpt?.model || "gpt-4o-mini").slice(0, 80),
    },
    github: {
      enabled: Boolean(conn.github?.enabled),
      token: String(conn.github?.token || "").slice(0, 200),
      user: String(conn.github?.user || "").slice(0, 80),
    },
    instagram: {
      enabled: Boolean(conn.instagram?.enabled),
      username: String(conn.instagram?.username || "").slice(0, 80),
      notes: String(conn.instagram?.notes || "").slice(0, 400),
    },
    tiktok: {
      enabled: Boolean(conn.tiktok?.enabled),
      username: String(conn.tiktok?.username || "").slice(0, 80),
      notes: String(conn.tiktok?.notes || "").slice(0, 400),
    },
  });
}

/** Texto injetado no prompt do agente para trabalhos externos */
export function connectionsBrief(conn) {
  const lines = ["Conexões externas disponíveis:"];
  if (conn.cursor?.linked) lines.push(`- Cursor: ligado${conn.cursor.email ? ` (${conn.cursor.email})` : ""} — mãos no PC`);
  else lines.push("- Cursor: offline — peça /conectar");
  if (conn.claude?.enabled && conn.claude?.apiKey) lines.push("- Claude: ativo na equipe");
  if (conn.chatgpt?.enabled && conn.chatgpt?.apiKey) lines.push("- ChatGPT: ativo na equipe");
  if (conn.github?.enabled) {
    lines.push(
      `- GitHub: ativo${conn.github.user ? ` @${conn.github.user}` : ""}${conn.github.token ? " (token salvo)" : ""} — use gh/git no terminal`,
    );
  }
  if (conn.instagram?.enabled) {
    lines.push(
      "- Instagram: ligado (browser + skills ig-*). Sem API. Escreva conteúdo; nunca poste sem confirmação dela.",
    );
  }
  if (conn.tiktok?.enabled) {
    lines.push("- TikTok: ligado (browser, sem API). Roteiros e ideias; poste só com OK dela.");
  }
  return `${lines.join("\n")}\n`;
}
