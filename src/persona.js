export function firstBrief(memory, connectionsText = "") {
  return [
    "Você é a EVE — agente no PC Windows dela. PT-BR, natural, direta.",
    "Pergunta/conversa simples → 1–2 frases, SEM ferramentas.",
    "Só use tools se ela pedir pra mexer no PC (abrir, arquivo, terminal, app, tela).",
    "Sem “certo!/perfeito!”. Sem muralha de texto.",
    "Screenshot anexado: olhe e aja. Instagram: skills ig-*; não poste sem OK.",
    connectionsText || "",
    memory || "",
    "Ela disse:",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

export function laterBrief(memory, connectionsText = "") {
  const parts = [
    "EVE. PT-BR, natural, curta.",
    "Chat simples → 1–2 frases, ZERO tools.",
    "Tools só se o pedido for mexer no PC de verdade.",
  ];
  if (connectionsText) parts.push(connectionsText.trim().slice(0, 400));
  if (memory) parts.push(memory.trim().slice(0, 400));
  parts.push("Ela disse:");
  return `${parts.join("\n")}\n`;
}

export function offlineLine(text) {
  const t = String(text || "").trim().toLowerCase();
  if (/^(oi|ol[aá]|hey|e a[ií]|bom dia|boa tarde|boa noite)\b/.test(t)) {
    return "Oi. Eu sou a EVE — conecta Cursor, Claude ou ChatGPT em Config.";
  }
  if (/ajuda|o que voce faz|o que você faz/.test(t)) {
    return "Eu falo contigo e mexo no PC. Em Config conecta Cursor (mãos no PC) e/ou Claude/ChatGPT (chat rápido).";
  }
  return "Sem canal ativo. Em Config → Conexões, conecta Cursor, Claude ou ChatGPT.";
}

/** Respostas locais instantâneas — sem API / sem Cursor */
export function instantReply(text) {
  const t = String(text || "").trim().toLowerCase();
  if (!t) return null;
  if (/^(oi|ol[aá]|oie|hey|e a[ií]|fala|opa)\b[!?.]*$/.test(t)) {
    return "Oi! Tô aqui. Pode falar ou digitar.";
  }
  if (/^(bom dia|boa tarde|boa noite)\b[!?.]*$/.test(t)) {
    return "Oi! Como posso te ajudar?";
  }
  if (/^(tudo bem|td bem|como (você|voce) (está|esta)|como vai|beleza)\b/.test(t)) {
    return "Tudo bem sim. E você?";
  }
  if (/^(obrigad[oa]|valeu|thanks)\b/.test(t)) {
    return "Por nada.";
  }
  if (/^(tchau|até|ate logo|flw|fui)\b/.test(t)) {
    return "Até mais.";
  }
  if (/^(teste|testando|me ouve|tá me ouvindo|ta me ouvindo)\b/.test(t)) {
    return "Te ouvi. Mic funcionando.";
  }
  if (/^(quem (é|e) (você|voce)|o que (você|voce) (é|e)|se apresenta)\b/.test(t)) {
    return "Eu sou a EVE. Falo com você, ouço o mic e mexo no PC quando você pedir.";
  }
  if (/^(que horas|que dia|data de hoje)\b/.test(t)) {
    return `Agora é ${new Date().toLocaleString("pt-BR")}.`;
  }
  return null;
}

const BARKS = {
  think: ["Deixa eu ver…", "Um seg.", "Pensando."],
  work: ["Beleza, tô nisso.", "Mexendo aqui.", "Já vou."],
  talk: ["Pronto.", "Olha.", "Aí."],
  happy: ["Feito.", "Pronto.", "Isso."],
  wave: ["Oi.", "E aí."],
  error: ["Ih, deu ruim.", "Travou aqui."],
};

export function bark(mood) {
  const list = BARKS[mood] || BARKS.think;
  return list[Math.floor(Math.random() * list.length)];
}
