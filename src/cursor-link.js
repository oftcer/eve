import path from "node:path";
import { brainDir } from "./brain.js";

let sdkPromise = null;
let store = null;
let agent = null;
let session = null;

function loadSdk() {
  if (!sdkPromise) {
    sdkPromise = import("@cursor/sdk");
  }
  return sdkPromise;
}

async function getStore() {
  const { JsonlLocalAgentStore } = await loadSdk();
  if (!store) {
    store = new JsonlLocalAgentStore(path.join(brainDir(), "agents"));
  }
  return store;
}

export async function login() {
  const { Cursor } = await loadSdk();
  return Cursor.auth.login({
    apiKeyName: "EVE",
    onLoginUrl(url) {
      console.log(`\nAbra este link se o navegador não abrir:\n${url}\n`);
    },
  });
}

export async function logout() {
  const { Cursor } = await loadSdk();
  await Cursor.auth.logout();
}

export async function authStatus() {
  const { Cursor } = await loadSdk();
  return Cursor.auth.status();
}

export async function openAgent({ agentId, cwd, model }) {
  if (
    agent &&
    session &&
    session.cwd === cwd &&
    session.model === model &&
    (!agentId || session.agentId === agentId)
  ) {
    return { agent, resumed: true };
  }

  const { Agent } = await loadSdk();
  const localStore = await getStore();
  const options = {
    model: { id: model },
    local: { cwd, store: localStore },
  };

  if (agent) {
    try {
      await agent[Symbol.asyncDispose]();
    } catch {
      agent.close?.();
    }
    agent = null;
    session = null;
  }

  if (agentId) {
    try {
      agent = await Agent.resume(agentId, options);
      session = { cwd, model, agentId: agent.agentId };
      return { agent, resumed: true };
    } catch {
      agent = null;
    }
  }

  agent = await Agent.create(options);
  session = { cwd, model, agentId: agent.agentId };
  return { agent, resumed: false };
}

export async function disposeAgent() {
  if (!agent) return;
  const current = agent;
  agent = null;
  session = null;
  try {
    await current[Symbol.asyncDispose]();
  } catch {
    current.close?.();
  }
}

export function isCursorError(error) {
  return error?.name === "CursorAgentError" || error?.constructor?.name === "CursorAgentError";
}

export function explainCursorError(error) {
  const message = error?.message || String(error);
  if (/401|unauthor|api key|logged out|credential|not logged/i.test(message)) {
    return "O Cursor não reconheceu a entrada. Digite /conectar.";
  }
  if (/model/i.test(message) && /not|invalid|unknown|available/i.test(message)) {
    return `O modelo não está disponível nesta conta. Tente /modelo composer-2.5. Detalhe: ${message}`;
  }
  return message;
}
