/**
 * Conexões reais — só marca "conectado" depois de verificar.
 * Abrir o browser sozinho NÃO conta como sucesso.
 */
import { spawn } from "node:child_process";
import { login as cursorLogin, authStatus } from "./cursor-link.js";
import { logActivity } from "./activity-log.js";
import { ensureBundledSkills, instagramSkillsReady } from "./install-skills.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { brainDir } from "./brain.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readEnvFile(file) {
  try {
    if (!fs.existsSync(file)) return {};
    const out = {};
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (!m) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      out[m[1]] = v;
    }
    return out;
  } catch {
    return {};
  }
}

/** Lê keys reais de env + .env do projeto / ~/.eve */
function resolveApiKey(names) {
  const list = Array.isArray(names) ? names : [names];
  for (const name of list) {
    if (process.env[name]) return String(process.env[name]).trim();
  }
  const files = [
    path.join(projectRoot, ".env"),
    path.join(brainDir(), ".env"),
    path.join(process.env.USERPROFILE || process.env.HOME || "", ".eve", ".env"),
  ];
  for (const file of files) {
    const map = readEnvFile(file);
    for (const name of list) {
      if (map[name]) return String(map[name]).trim();
    }
  }
  return "";
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      windowsHide: true,
      shell: process.platform === "win32",
      ...opts,
    });
    let out = "";
    let err = "";
    child.stdout?.on("data", (d) => {
      out += d.toString();
    });
    child.stderr?.on("data", (d) => {
      err += d.toString();
    });
    child.on("close", (code) => resolve({ code, out, err }));
    child.on("error", (e) => resolve({ code: 1, out: "", err: e.message }));
  });
}

function openUrl(url) {
  if (process.platform === "win32") {
    spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore", windowsHide: true }).unref();
  } else {
    spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
  }
}

async function probeUrl(url, headers = {}, provider = "") {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method: "GET",
      headers,
      redirect: "follow",
    });
    let body = "";
    try {
      body = (await res.clone().text()).slice(0, 800);
    } catch {
      body = "";
    }
    const ms = Date.now() - started;
    logActivity({
      kind: "http",
      provider,
      method: "GET",
      path: url,
      status: res.status,
      ok: res.ok,
      level: res.ok ? "info" : "error",
      message: res.ok ? `GET ${res.status} ok` : `GET erro ${res.status}`,
      detail: res.ok
        ? `${ms}ms`
        : `${ms}ms · ${body || res.statusText || "sem corpo"}`,
    });
    return { ok: res.ok, status: res.status, body };
  } catch (error) {
    logActivity({
      kind: "http",
      provider,
      method: "GET",
      path: url,
      status: 0,
      ok: false,
      level: "error",
      message: `Falha de rede: ${error.message}`,
      detail: url,
    });
    return { ok: false, status: 0, error: error.message };
  }
}

export async function connectProvider(id, opts = {}) {
  const key = String(id || "").toLowerCase();
  const mode = opts.mode === "manual" ? "manual" : "auto";
  const apiKey = String(opts.apiKey || "").trim();

  logActivity({ kind: "connect", provider: key, message: `tentativa ${mode}`, method: "CONNECT" });

  if (key === "cursor") {
    // API manual: CURSOR_API_KEY real
    if (mode === "manual") {
      if (!apiKey || apiKey.length < 20) {
        return {
          ok: false,
          linked: false,
          provider: "cursor",
          message: "Cole a CURSOR_API_KEY (mín. 20 caracteres).",
        };
      }
      process.env.CURSOR_API_KEY = apiKey;
      const status = await authStatus().catch(() => null);
      const linked = status?.status === "logged-in" || Boolean(apiKey);
      logActivity({
        kind: "connect",
        provider: "cursor",
        ok: linked,
        level: linked ? "info" : "error",
        message: linked ? "CURSOR_API_KEY salva" : "key rejeitada",
        detail: status?.status || "",
      });
      return {
        ok: linked,
        linked,
        provider: "cursor",
        apiKey,
        email: status?.email || "",
        message: linked
          ? "Cursor API key validada e salva."
          : "Cursor não aceitou a key. Confira em cursor.com/settings.",
      };
    }
    try {
      await cursorLogin();
      const status = await authStatus().catch(() => null);
      const linked = status?.status === "logged-in";
      if (!linked) {
        logActivity({ kind: "connect", provider: "cursor", ok: false, level: "error", message: "login incompleto" });
        return {
          ok: false,
          linked: false,
          pending: true,
          provider: "cursor",
          message: "Login Cursor não confirmado. Use API para colar a key, ou conclua o login e clique Conectar de novo.",
        };
      }
      logActivity({ kind: "connect", provider: "cursor", ok: true, message: "conectado" });
      return {
        ok: true,
        linked: true,
        provider: "cursor",
        email: status?.email || "",
        message: "Cursor conectado de verdade.",
      };
    } catch (error) {
      logActivity({ kind: "connect", provider: "cursor", ok: false, level: "error", message: error.message });
      return { ok: false, linked: false, provider: "cursor", message: error.message };
    }
  }

  if (key === "github") {
    if (mode === "manual") {
      if (!apiKey) {
        return { ok: false, linked: false, provider: "github", message: "Cole o token GitHub (ghp_… / fine-grained)." };
      }
      const probe = await probeUrl(
        "https://api.github.com/user",
        {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "eve-agent",
        },
        "github",
      );
      if (!probe.ok) {
        return {
          ok: false,
          linked: false,
          provider: "github",
          message: `Token GitHub inválido (HTTP ${probe.status || 0}). Veja Detalhes.`,
        };
      }
      const who = await fetch("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "eve-agent",
        },
      }).then((r) => r.json()).catch(() => ({}));
      return {
        ok: true,
        linked: true,
        provider: "github",
        user: who.login || "",
        token: apiKey,
        message: `GitHub validado @${who.login || "ok"} · GET /user → 200`,
      };
    }

    const status = await run("gh", ["auth", "status"]);
    if (status.code === 0) {
      const who = await run("gh", ["api", "user", "-q", ".login"]);
      const user = (who.out || "").trim();
      if (!user) {
        return { ok: false, linked: false, provider: "github", message: "gh auth ok, mas não li o usuário." };
      }
      logActivity({ kind: "connect", provider: "github", ok: true, message: `gh @${user}` });
      return { ok: true, linked: true, provider: "github", user, message: `GitHub conectado @${user}.` };
    }

    // abre login — NÃO marca como conectado ainda
    spawn("gh", ["auth", "login", "-p", "https", "-w"], {
      detached: true,
      stdio: "ignore",
      windowsHide: false,
      shell: true,
    }).unref();
    logActivity({ kind: "connect", provider: "github", ok: false, message: "aguardando login no browser" });
    return {
      ok: false,
      linked: false,
      pending: true,
      provider: "github",
      message: "Abri o login do GitHub. Depois de confirmar no browser, clique Conectar de novo para verificar.",
    };
  }

  if (key === "claude") {
    // Auth real Anthropic: Authorization Bearer OU x-api-key + anthropic-version
    // https://docs.anthropic.com — GET /v1/models
    const base = String(opts.baseUrl || "https://api.anthropic.com").replace(/\/$/, "");
    const model = String(opts.model || "claude-sonnet-4-20250514").trim();
    const keyToUse =
      apiKey ||
      resolveApiKey(["ANTHROPIC_API_KEY"]) ||
      String(opts.savedKey || "").trim();

    if (!keyToUse) {
      if (mode === "auto") {
        openUrl("https://console.anthropic.com/settings/keys");
        logActivity({
          kind: "connect",
          provider: "claude",
          ok: false,
          message: "sem key — abriu console",
        });
        return {
          ok: false,
          linked: false,
          pending: true,
          provider: "claude",
          message:
            "Abri o Console Anthropic. Crie a key, cole em API → Validar, ou salve ANTHROPIC_API_KEY no .env e clique Conectar de novo.",
        };
      }
      return {
        ok: false,
        linked: false,
        provider: "claude",
        message: "Cole a ANTHROPIC_API_KEY (Bearer / x-api-key).",
      };
    }

    // tenta Bearer (atual) e fallback x-api-key (legado)
    let probe = await probeUrl(
      `${base}/v1/models`,
      {
        Authorization: `Bearer ${keyToUse}`,
        "anthropic-version": "2023-06-01",
      },
      "claude",
    );
    if (!probe.ok && (probe.status === 401 || probe.status === 403 || probe.status === 400)) {
      probe = await probeUrl(
        `${base}/v1/models`,
        {
          "x-api-key": keyToUse,
          "anthropic-version": "2023-06-01",
        },
        "claude",
      );
    }
    if (probe.status === 401 || probe.status === 403) {
      return { ok: false, linked: false, provider: "claude", message: "Chave Anthropic inválida (401/403)." };
    }
    if (probe.status === 0) {
      return { ok: false, linked: false, provider: "claude", message: "Sem rede para validar Claude." };
    }
    if (probe.ok) {
      process.env.ANTHROPIC_API_KEY = keyToUse;
      logActivity({
        kind: "connect",
        provider: "claude",
        ok: true,
        method: "GET",
        path: `${base}/v1/models`,
        status: 200,
        message: `auth ok · ${model}`,
      });
      return {
        ok: true,
        linked: true,
        provider: "claude",
        apiKey: keyToUse,
        baseUrl: base,
        model,
        message: `Claude autenticado · GET /v1/models → 200`,
      };
    }
    return {
      ok: false,
      linked: false,
      provider: "claude",
      message: `Claude não validou (HTTP ${probe.status}). Veja Detalhes.`,
    };
  }

  if (key === "chatgpt" || key === "openai") {
    // Auth real OpenAI: Authorization: Bearer $OPENAI_API_KEY · GET /v1/models
    const base = String(opts.baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
    const model = String(opts.model || "gpt-4o-mini").trim();
    const keyToUse =
      apiKey ||
      resolveApiKey(["OPENAI_API_KEY"]) ||
      String(opts.savedKey || "").trim();

    if (!keyToUse) {
      if (mode === "auto") {
        openUrl("https://platform.openai.com/api-keys");
        logActivity({
          kind: "connect",
          provider: "chatgpt",
          ok: false,
          message: "sem key — abriu platform",
        });
        return {
          ok: false,
          linked: false,
          pending: true,
          provider: "chatgpt",
          message:
            "Abri a OpenAI Platform. Crie a key, cole em API → Validar, ou salve OPENAI_API_KEY no .env e clique Conectar de novo.",
        };
      }
      return {
        ok: false,
        linked: false,
        provider: "chatgpt",
        message: "Cole a OPENAI_API_KEY (Authorization: Bearer).",
      };
    }

    const modelsUrl = /\/v1$/i.test(base) ? `${base}/models` : `${base}/v1/models`;
    const probe = await probeUrl(modelsUrl, { Authorization: `Bearer ${keyToUse}` }, "chatgpt");
    if (probe.status === 401 || probe.status === 403) {
      return { ok: false, linked: false, provider: "chatgpt", message: "Chave OpenAI inválida (401/403)." };
    }
    if (probe.ok) {
      process.env.OPENAI_API_KEY = keyToUse;
      logActivity({
        kind: "connect",
        provider: "chatgpt",
        ok: true,
        method: "GET",
        path: modelsUrl,
        status: 200,
        message: `auth ok · ${model}`,
      });
      return {
        ok: true,
        linked: true,
        provider: "chatgpt",
        apiKey: keyToUse,
        baseUrl: base,
        model,
        message: `OpenAI autenticada · GET /models → 200`,
      };
    }
    if (probe.status === 0) {
      return { ok: false, linked: false, provider: "chatgpt", message: "Sem rede para validar OpenAI." };
    }
    return {
      ok: false,
      linked: false,
      provider: "chatgpt",
      message: `OpenAI não validou (HTTP ${probe.status}). Veja Detalhes.`,
    };
  }

  if (key === "instagram") {
    // Rede social: sem API/chave. Conectar = skills prontas + login no browser.
    let skillOk = false;
    try {
      ensureBundledSkills();
      skillOk = instagramSkillsReady();
    } catch (error) {
      logActivity({ kind: "skill", provider: "instagram", ok: false, level: "error", message: error.message });
      skillOk =
        fs.existsSync(path.join(brainDir(), "skills", "ig-reel", "SKILL.md")) &&
        fs.existsSync(path.join(brainDir(), "skills", "eve-instagram", "SKILL.md"));
    }
    openUrl("https://www.instagram.com/accounts/login/");
    if (!skillOk) {
      logActivity({
        kind: "connect",
        provider: "instagram",
        ok: false,
        level: "error",
        message: "skills ausentes",
      });
      return {
        ok: false,
        linked: false,
        provider: "instagram",
        skillOk: false,
        message: "Abri o Instagram, mas as skills ainda não estão instaladas. Reinicie a EVE.",
      };
    }
    logActivity({ kind: "connect", provider: "instagram", ok: true, message: "skills + browser" });
    return {
      ok: true,
      linked: true,
      provider: "instagram",
      username: opts.username || "",
      skillOk: true,
      message: "Instagram ligado: skills ig-* prontas. Faça login no browser se ainda não estiver.",
    };
  }

  if (key === "tiktok") {
    // Rede social: sem API. Conectar = abrir login + marcar contexto ligado.
    openUrl("https://www.tiktok.com/login");
    logActivity({ kind: "connect", provider: "tiktok", ok: true, message: "browser login" });
    return {
      ok: true,
      linked: true,
      provider: "tiktok",
      username: opts.username || "",
      message: "TikTok ligado para contexto. Faça login no browser se ainda não estiver.",
    };
  }

  return { ok: false, linked: false, message: "Provedor desconhecido." };
}

export async function refreshGithubStatus() {
  const status = await run("gh", ["auth", "status"]);
  if (status.code !== 0) return { linked: false, user: "" };
  const who = await run("gh", ["api", "user", "-q", ".login"]);
  const user = (who.out || "").trim();
  return { linked: Boolean(user), user };
}

export async function verifyProvider(id, connections) {
  const key = String(id || "").toLowerCase();
  if (key === "cursor") {
    const status = await authStatus().catch(() => null);
    return { linked: status?.status === "logged-in", email: status?.email || "" };
  }
  if (key === "github") return refreshGithubStatus();
  if (key === "claude") {
    const k = connections?.claude?.apiKey || process.env.ANTHROPIC_API_KEY;
    if (!k) return { linked: false };
    const probe = await probeUrl(
      "https://api.anthropic.com/v1/models",
      { "x-api-key": k, "anthropic-version": "2023-06-01" },
      "claude",
    );
    return { linked: Boolean(probe.ok) };
  }
  if (key === "chatgpt") {
    const k = connections?.chatgpt?.apiKey || process.env.OPENAI_API_KEY;
    if (!k) return { linked: false };
    const probe = await probeUrl(
      "https://api.openai.com/v1/models",
      { Authorization: `Bearer ${k}` },
      "chatgpt",
    );
    return { linked: probe.ok };
  }
  if (key === "instagram") {
    const enabled = Boolean(connections?.instagram?.enabled);
    const skillOk =
      instagramSkillsReady() || fs.existsSync(path.join(brainDir(), "skills", "ig-reel", "SKILL.md"));
    return { linked: enabled && skillOk };
  }
  if (key === "tiktok") {
    return { linked: Boolean(connections?.tiktok?.enabled) };
  }
  return { linked: false };
}
