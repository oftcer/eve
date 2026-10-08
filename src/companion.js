import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

async function readBody(req, limit = 64_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error("too large");
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8") || "{}";
  return JSON.parse(raw);
}

export function createCompanion({
  publicDir,
  getState,
  onSay,
  getProviders,
  saveProviders,
  getConnections,
  saveConnections,
  getAudio,
  saveAudio,
  onListen,
  onListenCancel,
  onMicActive,
  onConnect,
  getActivity,
  getSkills,
  onCommand,
}) {
  const clients = new Set();

  function broadcast() {
    const payload = `data: ${JSON.stringify(getState())}\n\n`;
    for (const res of clients) res.write(payload);
  }

  function json(res, code, body) {
    res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(body));
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", "http://127.0.0.1");

      if (req.method === "GET" && url.pathname === "/health") {
        return json(res, 200, { ok: true, viewers: clients.size });
      }

      if (req.method === "GET" && url.pathname === "/api/state") {
        return json(res, 200, getState());
      }

      if (req.method === "GET" && url.pathname === "/api/providers") {
        const providers = getProviders?.() || {};
        return json(res, 200, {
          cursor: {
            enabled: Boolean(providers.cursor?.enabled),
            linked: Boolean(providers.cursor?.linked),
          },
          claude: {
            enabled: Boolean(providers.claude?.enabled),
            hasKey: Boolean(providers.claude?.apiKey),
          },
          chatgpt: {
            enabled: Boolean(providers.chatgpt?.enabled),
            hasKey: Boolean(providers.chatgpt?.apiKey),
          },
        });
      }

      if (req.method === "POST" && url.pathname === "/api/providers") {
        const body = await readBody(req);
        const current = getProviders?.() || {};
        const next = {
          cursor: {
            enabled: body.cursor?.enabled ?? current.cursor?.enabled ?? true,
            linked: current.cursor?.linked ?? false,
          },
          claude: {
            enabled: body.claude?.enabled ?? current.claude?.enabled ?? false,
            apiKey:
              body.claude?.apiKey !== undefined && body.claude?.apiKey !== ""
                ? String(body.claude.apiKey)
                : current.claude?.apiKey || "",
          },
          chatgpt: {
            enabled: body.chatgpt?.enabled ?? current.chatgpt?.enabled ?? false,
            apiKey:
              body.chatgpt?.apiKey !== undefined && body.chatgpt?.apiKey !== ""
                ? String(body.chatgpt.apiKey)
                : current.chatgpt?.apiKey || "",
          },
        };
        saveProviders?.(next);
        return json(res, 200, { ok: true });
      }

      if (req.method === "GET" && url.pathname === "/api/audio") {
        return json(res, 200, getAudio?.() || {});
      }

      if (req.method === "POST" && url.pathname === "/api/audio") {
        const body = await readBody(req);
        saveAudio?.(body);
        return json(res, 200, { ok: true });
      }

      if (req.method === "GET" && url.pathname === "/api/connections") {
        const c = getConnections?.() || getProviders?.() || {};
        return json(res, 200, {
          cursor: {
            enabled: Boolean(c.cursor?.enabled),
            linked: Boolean(c.cursor?.linked),
            email: String(c.cursor?.email || ""),
            hasKey: Boolean(c.cursor?.apiKey || process.env.CURSOR_API_KEY),
          },
          claude: {
            enabled: Boolean(c.claude?.enabled),
            hasKey: Boolean(c.claude?.apiKey),
            baseUrl: String(c.claude?.baseUrl || "https://api.anthropic.com"),
            model: String(c.claude?.model || "claude-sonnet-4-20250514"),
          },
          chatgpt: {
            enabled: Boolean(c.chatgpt?.enabled),
            hasKey: Boolean(c.chatgpt?.apiKey),
            baseUrl: String(c.chatgpt?.baseUrl || "https://api.openai.com/v1"),
            model: String(c.chatgpt?.model || "gpt-4o-mini"),
          },
          github: {
            enabled: Boolean(c.github?.enabled),
            user: String(c.github?.user || ""),
            hasToken: Boolean(c.github?.token),
          },
          instagram: {
            enabled: Boolean(c.instagram?.enabled),
            username: String(c.instagram?.username || ""),
          },
          tiktok: {
            enabled: Boolean(c.tiktok?.enabled),
            username: String(c.tiktok?.username || ""),
          },
        });
      }

      if (req.method === "POST" && url.pathname === "/api/connections") {
        const body = await readBody(req);
        const current = getConnections?.() || {};
        const next = {
          cursor: {
            enabled: body.cursor?.enabled ?? current.cursor?.enabled ?? true,
            linked: current.cursor?.linked ?? false,
            email: current.cursor?.email || "",
          },
          claude: {
            enabled: body.claude?.enabled ?? current.claude?.enabled ?? false,
            apiKey:
              body.claude?.apiKey !== undefined && body.claude?.apiKey !== ""
                ? String(body.claude.apiKey)
                : current.claude?.apiKey || "",
          },
          chatgpt: {
            enabled: body.chatgpt?.enabled ?? current.chatgpt?.enabled ?? false,
            apiKey:
              body.chatgpt?.apiKey !== undefined && body.chatgpt?.apiKey !== ""
                ? String(body.chatgpt.apiKey)
                : current.chatgpt?.apiKey || "",
          },
          github: {
            enabled: body.github?.enabled ?? current.github?.enabled ?? false,
            user: body.github?.user !== undefined ? String(body.github.user) : current.github?.user || "",
            token:
              body.github?.token !== undefined && body.github?.token !== ""
                ? String(body.github.token)
                : current.github?.token || "",
          },
          instagram: {
            enabled: body.instagram?.enabled ?? current.instagram?.enabled ?? false,
            username:
              body.instagram?.username !== undefined
                ? String(body.instagram.username)
                : current.instagram?.username || "",
            notes: current.instagram?.notes || "",
          },
          tiktok: {
            enabled: body.tiktok?.enabled ?? current.tiktok?.enabled ?? false,
            username:
              body.tiktok?.username !== undefined ? String(body.tiktok.username) : current.tiktok?.username || "",
            notes: current.tiktok?.notes || "",
          },
        };
        saveConnections?.(next);
        // keep legacy providers in sync for Claude/ChatGPT/Cursor
        saveProviders?.({
          cursor: { enabled: next.cursor.enabled, linked: next.cursor.linked },
          claude: { enabled: next.claude.enabled, apiKey: next.claude.apiKey },
          chatgpt: { enabled: next.chatgpt.enabled, apiKey: next.chatgpt.apiKey },
        });
        return json(res, 200, { ok: true });
      }

      if (req.method === "POST" && url.pathname === "/api/listen") {
        try {
          // corpo opcional: { wavBase64 } gravado no front — preferido
          let body = {};
          try {
            body = await readBody(req, 8_000_000);
          } catch {
            body = {};
          }
          const result = await onListen?.(body);
          const text = String(result?.text || "").trim();
          return json(res, 200, {
            ok: Boolean(text),
            text,
            engine: result?.engine || "none",
            error: text ? undefined : result?.error,
          });
        } catch (error) {
          return json(res, 500, {
            ok: false,
            text: "",
            error: error?.message || "listen failed",
          });
        }
      }

      if (req.method === "POST" && url.pathname === "/api/listen/cancel") {
        onListenCancel?.();
        return json(res, 200, { ok: true });
      }

      if (req.method === "POST" && url.pathname === "/api/mic") {
        const body = await readBody(req);
        const active = Boolean(body.active);
        try {
          onMicActive?.(active);
        } catch {
          /* ok */
        }
        return json(res, 200, { ok: true });
      }

      if (req.method === "POST" && url.pathname === "/api/command") {
        const body = await readBody(req);
        const cmd = String(body.command || "").trim();
        if (!cmd) return json(res, 400, { ok: false });
        json(res, 202, { ok: true });
        onCommand?.(cmd);
        return;
      }

      if (req.method === "GET" && url.pathname === "/events") {
        res.writeHead(200, {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        });
        res.write(`data: ${JSON.stringify(getState())}\n\n`);
        clients.add(res);
        req.on("close", () => clients.delete(res));
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/say") {
        const body = await readBody(req, 32_000);
        const text = String(body.text || "").trim();
        if (!text) return json(res, 400, { ok: false });
        const via = body.via === "voice" ? "voz" : "tela";
        json(res, 202, { ok: true });
        onSay(text, via);
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/connect") {
        const body = await readBody(req);
        const provider = String(body.provider || "").trim();
        if (!provider) return json(res, 400, { ok: false });
        try {
          const result = await onConnect?.(provider, {
            mode: body.mode || "manual",
            apiKey: body.apiKey || "",
            username: body.username || "",
            baseUrl: body.baseUrl || "",
            model: body.model || "",
          });
          return json(res, 200, result || { ok: false });
        } catch (error) {
          return json(res, 500, { ok: false, linked: false, message: error?.message || "connect failed" });
        }
      }

      if (req.method === "GET" && url.pathname === "/api/activity") {
        const limit = Number(url.searchParams.get("limit") || 100);
        const provider = String(url.searchParams.get("provider") || "");
        const rows = getActivity?.(limit, provider) || [];
        return json(res, 200, { ok: true, rows, provider: provider || null });
      }

      if (req.method === "GET" && url.pathname === "/api/skills") {
        const skills = getSkills?.() || [];
        return json(res, 200, { ok: true, skills });
      }

      const rel = decodeURIComponent(url.pathname === "/" ? "index.html" : url.pathname).replace(/^[/\\]+/, "");
      const abs = path.resolve(publicDir, rel);
      const root = path.resolve(publicDir);
      if (abs !== root && !abs.startsWith(root + path.sep)) {
        res.writeHead(403);
        res.end();
        return;
      }
      if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("não achei");
        return;
      }
      const ext = path.extname(abs);
      res.writeHead(200, { "Content-Type": TYPES[ext] || "application/octet-stream" });
      fs.createReadStream(abs).pipe(res);
    } catch {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    }
  });

  return {
    server,
    broadcast,
    viewerCount() {
      return clients.size;
    },
    listen() {
      return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => resolve(server.address().port));
      });
    },
    close() {
      for (const res of clients) res.end();
      clients.clear();
      return new Promise((resolve) => server.close(() => resolve()));
    },
  };
}
