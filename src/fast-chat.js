/**
 * Resposta rápida via ChatGPT/Claude — sem Cursor Agent.
 * Usado pra conversa simples; PC/ferramentas vão pro agente.
 */
import { loadConnections } from "./connections.js";
import { loadProviders } from "./brain.js";

const SYSTEM = `Você é a EVE, assistente pessoal dela no PC. Português do Brasil, natural, curta e direta.
Resposta em 1–3 frases no máximo. Sem listas longas. Sem “certo!/perfeito!”.
Se ela pedir pra mexer em arquivo, app, terminal ou tela, diga em uma linha que vai fazer isso no PC.`;

/** Pedidos que precisam de mãos no PC (tools / screenshot) */
export function needsPcAgent(text) {
  const t = String(text || "").toLowerCase();
  return /\b(abre|abrir|fecha|fechar|arquivo|pasta|terminal|cmd|powershell|instala|instalar|deleta|apaga|renomeia|copia|move|npm|git|c[oó]digo|programa|executa|roda|cria um|crie um|escreve um arquivo|salva em|desktop|explorador|chrome|edge|vscode|bloco de notas|notepad|calculadora)\b/i.test(
    t,
  );
}

async function chatOpenAI(conn, userText, history) {
  const base = String(conn.chatgpt.baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = conn.chatgpt.model || "gpt-4o-mini";
  const messages = [
    { role: "system", content: SYSTEM },
    ...history,
    { role: "user", content: userText },
  ];
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${conn.chatgpt.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: 180,
      temperature: 0.7,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI ${res.status}: ${err.slice(0, 120)}`);
  }
  const data = await res.json();
  return String(data.choices?.[0]?.message?.content || "").trim();
}

async function chatClaude(conn, userText, history) {
  const base = String(conn.claude.baseUrl || "https://api.anthropic.com").replace(/\/$/, "");
  const model = conn.claude.model || "claude-sonnet-4-20250514";
  const messages = [
    ...history.map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    })),
    { role: "user", content: userText },
  ];
  const res = await fetch(`${base}/v1/messages`, {
    method: "POST",
    headers: {
      "x-api-key": conn.claude.apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 180,
      system: SYSTEM,
      messages,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude ${res.status}: ${err.slice(0, 120)}`);
  }
  const data = await res.json();
  const parts = data.content || [];
  return parts
    .filter((p) => p.type === "text")
    .map((p) => p.text)
    .join(" ")
    .trim();
}

function historyFromBrain(brain, limit = 6) {
  const turns = Array.isArray(brain?.turns) ? brain.turns.slice(-limit) : [];
  return turns
    .map((t) => {
      const role = t.role === "eve" || t.role === "assistant" ? "assistant" : "user";
      const content = String(t.text || t.content || "").trim();
      if (!content) return null;
      return { role, content: content.slice(0, 400) };
    })
    .filter(Boolean);
}

/**
 * @returns {Promise<{ text: string, engine: string } | null>}
 */
export async function fastChat(userText, brain) {
  const conn = loadConnections(loadProviders());
  const history = historyFromBrain(brain);
  const clean = String(userText || "").trim();
  if (!clean) return null;

  // ChatGPT e Claude: usa se tiver chave (Config → API / Conectar)
  if (conn.chatgpt?.apiKey) {
    try {
      const text = await chatOpenAI(conn, clean, history);
      if (text) return { text, engine: "chatgpt" };
    } catch {
      /* tenta Claude */
    }
  }

  if (conn.claude?.apiKey) {
    try {
      const text = await chatClaude(conn, clean, history);
      if (text) return { text, engine: "claude" };
    } catch {
      /* ok */
    }
  }

  return null;
}
