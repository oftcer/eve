import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createCompanion } from "./companion.js";
import {
  addFact,
  addTurn,
  brainDir,
  loadAudio,
  loadBrain,
  loadConfig,
  loadProviders,
  memoryBlock,
  saveAudio,
  saveBrain,
  saveConfig,
  saveProviders,
} from "./brain.js";
import { connectionsBrief, loadConnections, saveConnections } from "./connections.js";
import { ensureBundledSkills } from "./install-skills.js";
import { cancelListen, listenOnce, recognizeWav, warmupStt } from "./stt.js";
import { appendVoiceLog } from "./voice-log.js";
import { connectProvider, refreshGithubStatus } from "./connect-auth.js";
import { listActivity, logActivity } from "./activity-log.js";
import {
  authStatus,
  disposeAgent,
  explainCursorError,
  isCursorError,
  login,
  logout,
  openAgent,
} from "./cursor-link.js";
import { bark, firstBrief, laterBrief, offlineLine } from "./persona.js";
import { fastChat, needsPcAgent } from "./fast-chat.js";
import { speak, speakingNow, setSpeakIdleHandler, stopSpeaking, warmupVoice } from "./voice.js";
import { captureScreen } from "./screen.js";
import {
  createServiceSkill,
  detectServiceRequest,
  listSkills,
  teamBrief,
} from "./skills.js";
import { desktopAvailable, openDesktop } from "./desktop.js";
import { EveConsole } from "./ui/console.js";
import { theme as t } from "./ui/theme.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(root, "public");

const HELP = `
${t.cyan}${t.bold}EVE${t.reset} ${t.muted}// app CLI no seu PC${t.reset}

  ${t.blue}/ajuda${t.reset}              comandos
  ${t.blue}/conectar${t.reset}           login Cursor
  ${t.blue}/desconectar${t.reset}        sair da conta
  ${t.blue}/status${t.reset}             estado do canal
  ${t.blue}/voz on|off${t.reset}         fala feminina Piper Dii (padrão: on)
  ${t.blue}/tela${t.reset}               abre o app visual da EVE
  ${t.blue}/captura${t.reset}            testa se a EVE vê a tela agora
  ${t.blue}/skills${t.reset}             lista skills / equipes salvas
  ${t.blue}/cerebro${t.reset}            memórias
  ${t.blue}/lembrar texto${t.reset}      guarda fato
  ${t.blue}/esquecer tudo${t.reset}      apaga fatos
  ${t.blue}/pasta caminho${t.reset}      pasta de trabalho
  ${t.blue}/modelo id${t.reset}          ex.: composer-2.5
  ${t.blue}/novo${t.reset}               nova conversa
  ${t.blue}/parar${t.reset}              interrompe tarefa e voz
  ${t.blue}/sair${t.reset}               desliga

${t.muted}Ordem = ação. Ex.: cria um README · skill para loja · o que tem na tela?${t.reset}
`;

function loadEnv() {
  const file = path.join(root, ".env");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

function toolLabel(name, args) {
  const raw = String(name || "ferramenta");
  const lower = raw.toLowerCase();
  let verb = raw;
  if (lower.includes("read") || lower.includes("view")) verb = "lendo arquivo";
  else if (lower.includes("write") || lower.includes("edit") || lower.includes("strreplace")) verb = "editando no PC";
  else if (lower.includes("shell") || lower.includes("terminal") || lower.includes("bash")) verb = "rodando comando";
  else if (lower.includes("grep") || lower.includes("search") || lower.includes("glob")) verb = "varrendo arquivos";
  else if (lower.includes("delete") || lower.includes("remove")) verb = "removendo";
  else if (lower.includes("list") || lower === "ls") verb = "listando pasta";

  let hint = "";
  if (args && typeof args === "object") {
    const candidate =
      args.path ||
      args.file_path ||
      args.file ||
      args.target_file ||
      args.command ||
      args.pattern ||
      args.query;
    if (typeof candidate === "string" && candidate.trim()) hint = ` · ${candidate.trim().slice(0, 72)}`;
  }
  return `${verb}${hint}`;
}

function langFromPath(filePath) {
  const ext = String(filePath || "")
    .split(".")
    .pop()
    ?.toLowerCase() || "";
  const map = {
    js: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    jsx: "jsx",
    ts: "typescript",
    tsx: "tsx",
    py: "python",
    css: "css",
    scss: "scss",
    html: "html",
    htm: "html",
    json: "json",
    md: "markdown",
    mdx: "markdown",
    sh: "shell",
    bash: "shell",
    ps1: "powershell",
    sql: "sql",
    yml: "yaml",
    yaml: "yaml",
    toml: "toml",
    rs: "rust",
    go: "go",
    java: "java",
    php: "php",
    rb: "ruby",
    vue: "vue",
    svg: "svg",
    txt: "text",
  };
  return map[ext] || ext || "file";
}

function toolFileCard(name, args) {
  if (!args || typeof args !== "object") return null;
  const lower = String(name || "").toLowerCase();
  const filePath = String(
    args.path || args.file_path || args.file || args.target_file || args.target || "",
  ).trim();
  if (!filePath) return null;

  let action = "arquivo";
  if (lower.includes("read") || lower.includes("view") || lower.includes("cat")) action = "lendo";
  else if (lower.includes("write") || lower.includes("create")) action = "escrevendo";
  else if (lower.includes("edit") || lower.includes("strreplace") || lower.includes("apply")) action = "editando";
  else if (lower.includes("delete") || lower.includes("remove")) action = "removendo";

  const preview = String(
    args.contents ||
      args.content ||
      args.new_string ||
      args.newString ||
      args.code ||
      args.diff ||
      args.old_string ||
      "",
  ).slice(0, 6000);

  return {
    kind: "file",
    path: filePath.slice(0, 260),
    lang: langFromPath(filePath),
    action,
    preview,
    text: `${action} ${filePath}`,
  };
}

function assistantText(event, track) {
  if (event.type !== "assistant") return "";
  let text = "";
  for (const block of event.message?.content || []) {
    if (block?.type === "text" && block.text) text += block.text;
  }
  if (!text) return "";
  if (text.startsWith(track.full)) {
    const delta = text.slice(track.full.length);
    track.full = text;
    return delta;
  }
  if (track.full && text === track.full) return "";
  track.full += text;
  return text;
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error("tempo esgotado")), ms);
    }),
  ]);
}

export async function main(argv) {
  loadEnv();
  const ui = new EveConsole();
  const check = argv.includes("--check");
  const once = argv.filter((arg) => !arg.startsWith("--"));
  const config = loadConfig();
  const brain = loadBrain();

  if (argv.includes("--sem-voz")) config.voice = false;
  if (argv.includes("--sem-tela")) config.screen = false;
  if (argv.includes("--tela")) config.screen = true;

  let cwd = path.resolve(config.cwd || process.cwd());
  let activeRun = null;
  let cancelArmed = false;
  let linked = null;
  let utterId = 0;
  let rl = null;
  let accepting = true;
  const queue = [];
  let pumpRunning = false;
  /** true só quando o pedido veio do microfone → resposta por voz */
  let speakThisTurn = false;

  let companion = null;
  let screenUrl = null;
  let providers = loadProviders(config);
  let connections = loadConnections(providers);
  try {
    ensureBundledSkills();
  } catch {
    /* ok */
  }

  const state = {
    mood: "boot",
    say: "Olá. Eu sou a EVE.",
    status: "acordando",
    linked: false,
    email: "",
    utter: "",
    utterId: 0,
    speaking: false,
    transcript: [],
    log: [],
  };

  setSpeakIdleHandler(() => {
    state.speaking = false;
    companion?.broadcast();
  });

  function syncConnectionsCursor() {
    connections.cursor.linked = Boolean(linked && linked.status === "logged-in");
    connections.cursor.email = linked?.email || connections.cursor.email || "";
    connections.cursor.enabled = true;
    providers.cursor.linked = connections.cursor.linked;
  }

  async function ensureCompanion() {
    if (companion) return companion;
    companion = createCompanion({
      publicDir,
      getState: () => state,
      onSay: (text, via) => enqueue(text, via === "voz" ? "voz" : "tela"),
      onConnect: async (provider, opts = {}) => {
        const merged = { ...opts };
        if (provider === "claude") {
          merged.savedKey = connections.claude?.apiKey || "";
          merged.baseUrl = merged.baseUrl || connections.claude?.baseUrl || "";
          merged.model = merged.model || connections.claude?.model || "";
        }
        if (provider === "chatgpt" || provider === "openai") {
          merged.savedKey = connections.chatgpt?.apiKey || "";
          merged.baseUrl = merged.baseUrl || connections.chatgpt?.baseUrl || "";
          merged.model = merged.model || connections.chatgpt?.model || "";
        }
        if (provider === "github" && !merged.apiKey) {
          merged.apiKey = connections.github?.token || "";
        }
        if (provider === "cursor" && !merged.apiKey) {
          merged.apiKey = connections.cursor?.apiKey || process.env.CURSOR_API_KEY || "";
        }
        const result = await connectProvider(provider, merged);
        const linkedOk = Boolean(result?.linked);

        if (provider === "cursor") {
          if (linkedOk) {
            linked = { status: "logged-in", email: result.email || linked?.email || "" };
            state.linked = true;
            state.email = linked.email;
            connections.cursor.linked = true;
            connections.cursor.email = linked.email;
            if (result.apiKey) {
              connections.cursor.apiKey = result.apiKey;
              process.env.CURSOR_API_KEY = result.apiKey;
            }
          } else if (opts.mode === "manual") {
            connections.cursor.linked = false;
          } else {
            connections.cursor.linked = false;
          }
          saveConnections(connections);
          companion?.broadcast();
        }

        if (provider === "github") {
          connections.github.enabled = linkedOk;
          if (linkedOk && result.user) connections.github.user = result.user;
          if (linkedOk && result.token) connections.github.token = result.token;
          if (!linkedOk) connections.github.enabled = false;
          saveConnections(connections);
        }

        if (provider === "claude") {
          connections.claude.enabled = linkedOk;
          if (linkedOk && result.apiKey) connections.claude.apiKey = result.apiKey;
          if (opts.baseUrl) connections.claude.baseUrl = opts.baseUrl;
          if (opts.model) connections.claude.model = opts.model;
          if (!linkedOk && opts.mode === "manual") connections.claude.enabled = false;
          saveConnections(connections);
        }

        if (provider === "chatgpt" || provider === "openai") {
          connections.chatgpt.enabled = linkedOk;
          if (linkedOk && result.apiKey) connections.chatgpt.apiKey = result.apiKey;
          if (opts.baseUrl) connections.chatgpt.baseUrl = opts.baseUrl;
          if (opts.model) connections.chatgpt.model = opts.model;
          if (!linkedOk && opts.mode === "manual") connections.chatgpt.enabled = false;
          saveConnections(connections);
        }

        if (provider === "instagram") {
          connections.instagram.enabled = linkedOk;
          if (linkedOk && result.username) connections.instagram.username = result.username;
          if (!linkedOk) {
            connections.instagram.enabled = false;
            connections.instagram.username = "";
          }
          saveConnections(connections);
        }

        if (provider === "tiktok") {
          connections.tiktok.enabled = linkedOk;
          if (linkedOk && result.username) connections.tiktok.username = result.username;
          if (!linkedOk) {
            connections.tiktok.enabled = false;
            connections.tiktok.username = "";
          }
          saveConnections(connections);
        }

        companion?.broadcast();
        return result;
      },
      getActivity: (limit, provider) => listActivity(limit, provider),
      getSkills: () => [],
      getProviders: () => {
        syncConnectionsCursor();
        return providers;
      },
      saveProviders: (next) => {
        providers = next;
        saveProviders(providers);
      },
      getConnections: () => {
        syncConnectionsCursor();
        return connections;
      },
      saveConnections: (next) => {
        connections = next;
        saveConnections(connections);
        providers = {
          cursor: { enabled: next.cursor.enabled, linked: next.cursor.linked },
          claude: { enabled: next.claude.enabled, apiKey: next.claude.apiKey },
          chatgpt: { enabled: next.chatgpt.enabled, apiKey: next.chatgpt.apiKey },
        };
        saveProviders(providers);
      },
      getAudio: () => loadAudio(),
      saveAudio: (next) => saveAudio(next),
      onListen: async (body) => {
        const b64 = String(body?.wavBase64 || "").trim();
        if (b64) {
          const buf = Buffer.from(b64, "base64");
          logActivity({
            kind: "stt",
            provider: "mic",
            method: "POST",
            path: "/api/listen",
            message: `wav ${buf.length}b`,
          });
          const result = await recognizeWav(buf);
          logActivity({
            kind: "stt",
            provider: "mic",
            method: "POST",
            path: "/api/listen",
            status: result?.text ? 200 : 422,
            ok: Boolean(result?.text),
            level: result?.text ? "info" : "error",
            message: result?.text
              ? `POST ok · ${result.engine}`
              : result?.error || "sem fala",
            detail: result?.text
              ? String(result.text).slice(0, 120)
              : String(result?.detail || "").slice(0, 80),
          });
          return result;
        }
        return listenOnce();
      },
      onListenCancel: () => cancelListen(),
      onMicActive: (active) => {
        // só pausa a voz dela enquanto você fala — NÃO cancela tarefa no PC
        if (active) stopSpeaking();
      },
      onCommand: (cmd) => enqueue(cmd.startsWith("/") ? cmd : `/${cmd}`, "tela"),
    });
    const port = await companion.listen();
    screenUrl = `http://127.0.0.1:${port}/`;
    return companion;
  }

  function syncUiMeta() {
    const cursorLabel =
      linked?.status === "logged-in"
        ? linked.email || "ligado"
        : linked?.status === "logged-out"
          ? "desligado — /conectar"
          : "…";
    ui.setMeta({
      status: state.status,
      cursor: cursorLabel,
      voice: config.voice ? "on" : "off",
    });
  }

  function pushLog(kind, text) {
    state.log.push({ kind, text: String(text).slice(0, 240) });
    if (state.log.length > 40) state.log.splice(0, state.log.length - 40);
    companion?.broadcast();
  }

  function cleanAgentText(text) {
    return String(text || "")
      .replace(/<\/?(?:strong|b|em|i|span|div|p|br)\s*\/?>/gi, "")
      .replace(/&lt;\/?(?:strong|b)&gt;/gi, "")
      .replace(/\*{3,}/g, "**")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function pushTranscript(role, text, meta = {}) {
    const cleaned = role === "eve" ? cleanAgentText(text) : String(text || "");
    const entry = {
      role,
      text: cleaned.slice(0, 4000),
      via: meta.via || "text",
      kind: meta.kind || "text",
    };
    if (meta.kind === "file") {
      entry.path = String(meta.path || "").slice(0, 260);
      entry.lang = String(meta.lang || "file").slice(0, 32);
      entry.action = String(meta.action || "arquivo").slice(0, 32);
      entry.preview = String(meta.preview || "").slice(0, 6000);
    }
    state.transcript.push(entry);
    if (state.transcript.length > 40) state.transcript.splice(0, state.transcript.length - 40);
    companion?.broadcast();
  }

  function setMood(mood, say, status) {
    state.mood = mood;
    if (say) state.say = cleanAgentText(say);
    if (status) state.status = status;
    state.linked = Boolean(linked && linked.status === "logged-in");
    state.email = linked?.email || "";
    ui.setMood(mood);
    syncUiMeta();
    ui.refreshPanel();
    companion?.broadcast();
  }

  function voiceOut(line) {
    // ChatGPT-like: fala só quando o pedido veio do mic (e voz ligada / não mute)
    if (!config.voice || !speakThisTurn || !line) return;
    utterId += 1;
    state.utter = line;
    state.utterId = utterId;
    state.speaking = true;
    companion?.broadcast();
    speak(line);
  }

  function sayLine(text) {
    ui.eve(text);
  }

  async function openScreen() {
    if (!screenUrl) return;
    try {
      const health = await fetch(`${screenUrl}health`);
      if (!health.ok) throw new Error("health");
    } catch {
      ui.system("Painel ainda aquecendo…");
      await new Promise((r) => setTimeout(r, 400));
    }
    ui.system(`Painel → ${screenUrl}`);

    if (openDesktop(screenUrl)) {
      ui.system("App EVE (janela própria) — sem Edge/Chrome.");
      return;
    }

    if (!desktopAvailable()) {
      ui.system("Electron ausente — rode npm install. Abrindo fallback do sistema…");
    }

    // Fallback só se o desktop não estiver instalado
    if (process.platform === "win32") {
      spawn("cmd", ["/c", "start", "", screenUrl], {
        detached: true,
        stdio: "ignore",
      }).unref();
      return;
    }
    spawn("xdg-open", [screenUrl], { detached: true, stdio: "ignore" }).unref();
  }

  function installSkillInProject(skill) {
    try {
      const dest = path.join(cwd, ".cursor", "skills", `eve-${skill.id}`);
      fs.mkdirSync(dest, { recursive: true });
      fs.copyFileSync(skill.skillPath, path.join(dest, "SKILL.md"));
      const teamSrc = path.join(skill.dir, "team.json");
      if (fs.existsSync(teamSrc)) fs.copyFileSync(teamSrc, path.join(dest, "team.json"));
      return dest;
    } catch {
      return null;
    }
  }

  async function refreshLink() {
    try {
      linked = await withTimeout(authStatus(), 8000);
    } catch (error) {
      linked = { status: "unknown", detail: error.message };
    }
    if (linked?.status !== "logged-in" && process.env.CURSOR_API_KEY) {
      linked = { status: "logged-in", email: linked?.email || "" };
    }
    state.linked = linked?.status === "logged-in";
    state.email = linked?.email || "";
    syncUiMeta();
    ui.refreshPanel();
    companion?.broadcast();
    return linked;
  }

  function remembered(text) {
    const match = text.match(/^(?:lembra que|lembre que|guarda que)\s+(.+)/i);
    if (!match) return null;
    addFact(brain, match[1]);
    return "Guardei na memória.";
  }

  async function handleCommand(text) {
    const [head, ...rest] = text.slice(1).trim().split(/\s+/);
    const arg = rest.join(" ").trim();
    const name = (head || "").toLowerCase();

    if (name === "ajuda" || name === "help") {
      ui.help(HELP);
      return;
    }
    if (name === "sair" || name === "exit" || name === "quit") {
      await shutdown(0);
      return;
    }
    if (name === "tela") {
      await ensureCompanion();
      await openScreen();
      sayLine("Painel visual aberto.");
      setMood("wave", "Painel ativo.", "na tela");
      return;
    }
    if (name === "captura" || name === "screenshot") {
      setMood("think", "Olhando a tela…", "pensando");
      try {
        const shot = await captureScreen();
        if (!shot?.data) {
          sayLine("Não consegui capturar a tela. Rode o app no Windows com PowerShell disponível.");
          setMood("error", "Sem captura.", "erro");
          return;
        }
        const kb = Math.round((shot.data.length * 0.75) / 1024);
        sayLine(`Vi a tela agora (~${kb} KB PNG). Nas próximas ordens com “veja a tela / abra / clique” eu anexo essa visão ao Cursor.`);
        setMood("happy", "Tela capturada.", "pronto");
        voiceOut("Tela capturada. Eu consigo ver.");
        pushLog("info", `captura ok · ${kb}kb`);
      } catch (error) {
        sayLine(`Falha na captura: ${error.message}`);
        setMood("error", "Captura falhou.", "erro");
      }
      return;
    }
    if (name === "skills" || name === "skill" || name === "equipes") {
      const skills = listSkills();
      if (!skills.length) {
        sayLine('Nenhuma skill ainda. Peça: "cria uma skill para loja online".');
        return;
      }
      ui.system("— skills / equipes —");
      for (const s of skills) {
        const roles = (s.team || []).map((m) => m.title).join(", ");
        ui.system(`${s.id} · ${s.service}${roles ? ` · ${roles}` : ""}`);
      }
      return;
    }
    if (name === "voz") {
      const on = arg === "on" || arg === "sim" || arg === "1";
      const off = arg === "off" || arg === "nao" || arg === "não" || arg === "0";
      if (!on && !off) {
        sayLine("Use /voz on ou /voz off.");
        return;
      }
      config.voice = on;
      saveConfig(config);
      if (off) stopSpeaking();
      syncUiMeta();
      ui.refreshPanel();
      sayLine(on ? "Voz ligada." : "Voz desligada.");
      return;
    }
    if (name === "status") {
      const link = await refreshLink();
      const who = link?.status === "logged-in" ? link.email || "conectado" : link?.status || "sem ligação";
      ui.system(`Cursor   ${who}`);
      ui.system(`Voz      ${config.voice ? "Piper Dii pt-BR · ligada" : "muda"}`);
      ui.system(`Tela     ${config.screen === false ? "off" : "captura ativa"}`);
      ui.system(`Memória  ${brain.facts.length} fatos`);
      ui.system(`Skills   ${listSkills().length}`);
      if (screenUrl) ui.system(`Painel   ${screenUrl}`);
      return;
    }
    if (name === "conectar") {
      setMood("think", "Abrindo login.", "conectando");
      sayLine("Abrindo o login do Cursor. Confirme no navegador.");
      try {
        const result = await login();
        linked = { status: "logged-in", email: result?.email || "" };
        state.linked = true;
        state.email = linked.email;
        providers.cursor.linked = true;
        providers.cursor.enabled = true;
        saveProviders(providers);
        connections.cursor.linked = true;
        connections.cursor.enabled = true;
        connections.cursor.email = linked.email || "";
        saveConnections(connections);
        const line = linked.email ? `Canal aberto · ${linked.email}` : "Canal Cursor aberto.";
        sayLine(line);
        setMood("happy", "Cursor ligado.", "conectado");
        voiceOut("Cursor ligado. Pode pedir o que quiser.");
        companion?.broadcast();
      } catch (error) {
        sayLine(explainCursorError(error));
        setMood("error", "Não entrei.", "erro");
      }
      return;
    }
    if (name === "desconectar") {
      try {
        await logout();
        linked = { status: "logged-out" };
        state.linked = false;
        state.email = "";
        sayLine("Canal Cursor fechado.");
        setMood("idle", "Desconectado.", "pronto");
      } catch (error) {
        sayLine(explainCursorError(error));
      }
      return;
    }
    if (name === "cerebro") {
      if (!brain.facts.length) ui.system("Nenhum fato. Use /lembrar …");
      brain.facts.forEach((fact, index) => ui.system(`${index + 1}. ${fact.text}`));
      const recent = brain.history.slice(-6);
      if (recent.length) {
        ui.system("— últimas falas —");
        for (const turn of recent) {
          ui.system(`${turn.role === "voce" ? "você" : "EVE"}: ${turn.text.slice(0, 160)}`);
        }
      }
      return;
    }
    if (name === "lembrar") {
      if (!addFact(brain, arg)) {
        sayLine("Diga /lembrar e o que eu devo guardar.");
        return;
      }
      sayLine("Guardei.");
      setMood("happy", "Guardei.", "lembrei");
      voiceOut("Guardei.");
      return;
    }
    if (name === "esquecer") {
      if (arg.toLowerCase() !== "tudo") {
        sayLine("Use /esquecer tudo.");
        return;
      }
      brain.facts = [];
      saveBrain(brain);
      sayLine("Memória limpa.");
      return;
    }
    if (name === "pasta") {
      if (!arg) {
        sayLine("Pasta de trabalho definida.");
        return;
      }
      const next = path.resolve(cwd, arg);
      if (!fs.existsSync(next) || !fs.statSync(next).isDirectory()) {
        sayLine("Essa pasta não existe.");
        return;
      }
      cwd = next;
      config.cwd = cwd;
      config.agentId = null;
      config.primed = false;
      saveConfig(config);
      await disposeAgent();
      sayLine("Pasta de trabalho atualizada.");
      setMood("work", "Pasta nova.", "pronto");
      return;
    }
    if (name === "modelo") {
      if (!arg) {
        sayLine("Modelo configurado.");
        return;
      }
      config.model = arg;
      config.agentId = null;
      config.primed = false;
      saveConfig(config);
      await disposeAgent();
      sayLine("Modelo atualizado. A próxima ordem abre um agente novo.");
      return;
    }
    if (name === "novo") {
      config.agentId = null;
      config.primed = false;
      saveConfig(config);
      await disposeAgent();
      sayLine("Sessão nova. A memória continua.");
      setMood("wave", "Oi de novo.", "pronto");
      return;
    }
    if (name === "parar") {
      stopSpeaking();
      if (activeRun?.supports?.("cancel")) {
        await activeRun.cancel();
        ui.streamEnd();
        sayLine("Interrompido.");
        setMood("idle", "Parei.", "pronto");
      } else {
        sayLine("Nenhuma tarefa em andamento.");
      }
      return;
    }

    sayLine("Comando desconhecido. Digite /ajuda.");
  }

  async function runAgent(text) {
    const t0 = Date.now();
    const mark = (label) => pushLog("info", `⏱ ${label} +${Date.now() - t0}ms`);
    const memory = memoryBlock(brain);
    let promptBody = text;
    const pcTask = needsPcAgent(text) || Boolean(detectServiceRequest(text));

    const serviceName = detectServiceRequest(text);
    if (serviceName) {
      const skill = createServiceSkill(serviceName, { providers });
      const installed = installSkillInProject(skill);
      const brief = teamBrief(skill);
      promptBody = `${brief}\n\nPedido original: ${text}`;
      sayLine(`Equipe montada para "${serviceName}" · ${skill.team.length} agentes.`);
      if (installed) ui.system(`Skill no projeto: ${installed}`);
      pushLog("info", `skill ${skill.id} · equipe ${skill.team.length}`);
      setMood("work", `Equipe ${serviceName}`, "trabalhando");
      voiceOut(`Montei a equipe para ${serviceName}.`);
    }

    // chat simples: proíbe tools — responde rápido sem varrer o PC
    if (!pcTask) {
      promptBody = `[MODO CHAT RÁPIDO]
Responda em 1–2 frases curtas em PT-BR.
PROIBIDO: tools, terminal, ler/escrever arquivos, buscar no disco, shell, browser.
Só texto. Sem listas.

Ela disse: ${text}`;
    }

    syncConnectionsCursor();
    const connText = connectionsBrief(connections);
    const prompt = config.primed
      ? `${laterBrief(memory, pcTask ? connText : "")}${promptBody}`
      : `${firstBrief(memory, connText)}\n${promptBody}`;
    setMood("think", bark("think"), "pensando");
    ui.setMeta({ activity: pcTask ? "Cursor (PC)…" : "Cursor (chat)…" });
    ui.refreshPanel();

    let opened;
    try {
      opened = await openAgent({
        agentId: config.agentId,
        cwd,
        model: config.model,
      });
      mark(opened.resumed ? "agent resume" : "agent create");
    } catch (error) {
      const line =
        isCursorError(error) || error?.message
          ? explainCursorError(error)
          : "Não consegui falar com o Cursor.";
      sayLine(line);
      if (/Cannot find module/.test(error?.message || "")) {
        sayLine("Rode npm install na pasta do projeto.");
      }
      setMood("error", bark("error"), "erro");
      voiceOut("Não consegui entrar no Cursor.");
      pushTranscript("eve", line);
      return;
    }

    if (!opened.resumed && config.agentId) {
      ui.system("Sessão anterior expirou. Comecei outra.");
    }
    if (config.agentId !== opened.agent.agentId) {
      config.agentId = opened.agent.agentId;
      saveConfig(config);
    }

    const track = { full: "" };
    const seenTools = new Set();
    let streamed = "";

    try {
      const run = await opened.agent.send(prompt);
      activeRun = run;
      setMood("work", bark("work"), pcTask ? "trabalhando" : "pensando");
      ui.setMeta({ activity: pcTask ? "mexendo no PC…" : "respondendo…" });
      ui.refreshPanel();
      pushLog("info", pcTask ? "agente · PC" : "agente · chat rápido");
      mark("send");

      let lastBroadcast = 0;
      for await (const event of run.stream()) {
        if (event.type === "thinking") {
          if (state.status !== "pensando") setMood("think", state.say || bark("think"), "pensando");
          continue;
        }
        if (event.type === "tool_call") {
          const label = toolLabel(event.name, event.args);
          if (event.status === "running") {
            const key = event.call_id || label;
            if (seenTools.has(key)) continue;
            seenTools.add(key);
            if (state.status !== "trabalhando") setMood("work", state.say || bark("work"), "trabalhando");
            else {
              state.status = "trabalhando";
              companion?.broadcast();
            }
            ui.tool(label);
            pushLog("tool", label);
            const card = toolFileCard(event.name, event.args);
            if (card) {
              pushTranscript("eve", card.text, card);
            }
          } else if (event.status === "error") {
            pushLog("err", `${label} falhou`);
          }
          continue;
        }
        const delta = assistantText(event, track);
        if (!delta) continue;
        if (!ui.streamOpen) {
          ui.streamBegin();
          setMood("talk", state.say || bark("talk"), "falando");
        }
        ui.streamWrite(delta);
        streamed += delta;
        state.say = streamed.slice(-220);
        state.status = "falando";
        // throttle SSE — evita rebuild/pisca no front a cada token
        const now = Date.now();
        if (now - lastBroadcast > 120) {
          lastBroadcast = now;
          companion?.broadcast();
        }
      }
      companion?.broadcast();

      const result = await run.wait();
      ui.streamEnd();
      activeRun = null;

      if (result.status === "error") {
        const line = result.error?.message || "A tarefa parou com erro.";
        sayLine(line);
        setMood("error", bark("error"), "erro");
        voiceOut("Algo falhou.");
        pushTranscript("eve", line);
        return;
      }
      if (result.status === "cancelled") {
        setMood("idle", "Parei.", "pronto");
        return;
      }

      if (!config.primed) {
        config.primed = true;
        saveConfig(config);
      }
      mark(`done · tools=${seenTools.size}`);
      const finalText = cleanAgentText(result.result || streamed || "");
      if (!streamed && finalText) sayLine(finalText);
      if (finalText) {
        pushTranscript("eve", finalText);
        addTurn(brain, "eve", finalText);
        const spoken = finalText.split(/(?<=[.!?])\s/)[0].slice(0, 220);
        setMood("happy", spoken || bark("happy"), "pronto");
        ui.setMeta({ activity: `ok · ${((Date.now() - t0) / 1000).toFixed(1)}s` });
        ui.refreshPanel();
        voiceOut(spoken || "Feito.");
      } else {
        setMood("happy", bark("happy"), "pronto");
        voiceOut("Feito.");
      }
    } catch (error) {
      ui.streamEnd();
      activeRun = null;
      const line = explainCursorError(error);
      sayLine(line);
      setMood("error", bark("error"), "erro");
      voiceOut("Algo travou.");
      pushTranscript("eve", line);
      if (isCursorError(error) && error.isRetryable) {
        ui.system("Pode tentar de novo — falha temporária.");
      }
    }
  }

  async function handleLine(text, source) {
    const clean = String(text || "").trim();
    if (!clean) return;
    // texto digitado → sem voz; microfone → com voz
    speakThisTurn = source === "voz" && config.voice !== false;
    if (source === "voz") {
      ui.user(`${clean} ${t.muted}(voz)${t.reset}`);
    } else if (source === "tela") {
      ui.user(`${clean} ${t.muted}(tela)${t.reset}`);
    } else if (!clean.startsWith("/")) {
      ui.user(clean);
    }
    if (clean.startsWith("/")) {
      await handleCommand(clean);
      return;
    }
    if (source === "voz") {
      appendVoiceLog(clean);
      pushTranscript("voce", clean, { via: "voice" });
    } else {
      pushTranscript("voce", clean, { via: "text" });
    }
    addTurn(brain, "voce", clean);

    const pcTask = needsPcAgent(clean) || Boolean(detectServiceRequest(clean));

    // ChatGPT / Claude primeiro (chat rápido) — Cursor Agent pra PC
    if (!pcTask) {
      setMood("think", bark("think"), "pensando");
      companion?.broadcast();
      try {
        const quick = await fastChat(clean, brain);
        if (quick?.text) {
          const reply = cleanAgentText(quick.text);
          sayLine(reply);
          setMood("happy", reply.slice(0, 120), "pronto");
          ui.setMeta({ activity: `chat · ${quick.engine}` });
          ui.refreshPanel();
          pushTranscript("eve", reply);
          addTurn(brain, "eve", reply);
          pushLog("info", `chat · ${quick.engine}`);
          const spoken = reply.split(/(?<=[.!?])\s/)[0].slice(0, 180);
          voiceOut(spoken || reply.slice(0, 180));
          companion?.broadcast();
          return;
        }
      } catch {
        /* tenta Cursor */
      }
    }

    if (!linked || linked.status === "unknown") await refreshLink();
    if (linked?.status !== "logged-in" && !process.env.CURSOR_API_KEY) {
      const line = offlineLine(clean);
      sayLine(line);
      setMood("wave", line.slice(0, 80), "sem cursor");
      voiceOut("Conecta o Cursor, ou cola a chave do Claude/ChatGPT em Config.");
      pushTranscript("eve", line);
      addTurn(brain, "eve", line);
      return;
    }

    pushLog("info", pcTask ? "Cursor Agent · PC" : "Cursor Agent · chat");
    await runAgent(clean);
  }

  async function pump() {
    if (pumpRunning) return;
    pumpRunning = true;
    ui.busy = true;
    try {
      while (queue.length) {
        const job = queue.shift();
        await handleLine(job.text, job.source);
      }
    } finally {
      pumpRunning = false;
      ui.busy = false;
      if (queue.length) void pump();
      else if (accepting) showPrompt();
    }
  }

  function showPrompt() {
    if (!rl) return;
    rl.setPrompt(ui.promptLabel());
    rl.prompt();
  }

  function enqueue(text, source) {
    queue.push({ text, source });
    // fila: mensagem de voz entra sem cancelar agente ativo
    void pump();
  }

  async function shutdown(code) {
    ui.stopAnim();
    stopSpeaking();
    setMood("idle", "Até logo.", "desligando");
    if (activeRun?.supports?.("cancel")) {
      try {
        await activeRun.cancel();
      } catch {
        /* ok */
      }
    }
    await disposeAgent();
    if (companion) await companion.close();
    process.exit(code);
  }

  if (check) {
    await ensureCompanion();
    const page = await fetch(screenUrl);
    const html = await page.text();
    if (!page.ok || !html.includes("eve-stage") || !html.includes("EVE")) {
      console.error("Painel visual incompleto.");
      await companion.close();
      process.exit(1);
    }
    const css = await fetch(new URL("style.css", screenUrl));
    const js = await fetch(new URL("app.js", screenUrl));
    const svg = await fetch(new URL("eve/wave.svg", screenUrl));
    if (!css.ok || !js.ok || !svg.ok) {
      console.error("Assets do painel incompletos.");
      await companion.close();
      process.exit(1);
    }
    try {
      await withTimeout(import("@cursor/sdk"), 20000);
    } catch (error) {
      console.error(`Cursor SDK: ${error.message}`);
      await companion.close();
      process.exit(1);
    }
    const skill = createServiceSkill("check-demo", { providers });
    if (!fs.existsSync(skill.skillPath)) {
      console.error("Skills não gravaram.");
      await companion.close();
      process.exit(1);
    }
    console.log(`${t.cyan}EVE OK${t.reset} · painel · sdk · skills`);
    await companion.close();
    return;
  }

  ui.splash();
  ui.mountPanel();
  ui.startAnim(() => {
    syncUiMeta();
    ui.refreshPanel();
  });

  setMood("wave", bark("wave"), "pronto");

  if (config.voice !== false) warmupVoice();
  warmupStt();

  if (config.screen !== false) {
    await ensureCompanion();
    await openScreen();
    ui.system("App EVE aberto — se a janela vier branca, abra o link acima no Edge.");
  }

  speakThisTurn = true;
  voiceOut("Oi. Eu sou a EVE. Pode falar no mic ou digitar.");
  speakThisTurn = false;
  pushLog("info", "online");

  const link = await refreshLink();
  if (link?.status === "logged-in") {
    ui.system(`Canal Cursor ativo${link.email ? ` · ${link.email}` : ""}.`);
  } else {
    ui.system(`${t.blue}Canal Cursor fechado${t.reset} — digite ${t.cyan}/conectar${t.reset} para eu mexer no PC.`);
  }

  if (once.length) {
    await handleLine(once.join(" "), "cli");
    await shutdown(0);
    return;
  }

  rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });

  rl.on("line", (line) => enqueue(line, "cli"));

  rl.on("close", () => {
    accepting = false;
    const wait = setInterval(() => {
      if (!pumpRunning && queue.length === 0) {
        clearInterval(wait);
        shutdown(0);
      }
    }, 40);
  });

  process.on("SIGINT", () => {
    if (activeRun?.supports?.("cancel") && !cancelArmed) {
      cancelArmed = true;
      stopSpeaking();
      activeRun.cancel().finally(() => {
        cancelArmed = false;
        activeRun = null;
        ui.streamEnd();
        sayLine("Interrompido. Ctrl+C de novo desliga.");
        setMood("idle", "Parei.", "pronto");
        showPrompt();
      });
      return;
    }
    shutdown(0);
  });

  showPrompt();
}
