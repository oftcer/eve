/** EVE — hack palette: black / white / cyan */
export const theme = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  italic: "\x1b[3m",
  bg: "\x1b[48;5;16m",
  bgPanel: "\x1b[48;5;232m",
  fg: "\x1b[38;5;255m",
  muted: "\x1b[38;5;245m",
  blue: "\x1b[38;5;45m",
  cyan: "\x1b[38;5;51m",
  green: "\x1b[38;5;84m",
  red: "\x1b[38;5;203m",
  line: "\x1b[38;5;238m",
  // aliases used by older helpers
  gold: "\x1b[38;5;51m",
  amber: "\x1b[38;5;45m",
  rust: "\x1b[38;5;45m",
  copper: "\x1b[38;5;39m",
  eye: "\x1b[38;5;51m",
};

export function paint(text, ...styles) {
  return `${styles.join("")}${text}${theme.reset}`;
}

export function width() {
  const cols = process.stdout.columns || 80;
  return Math.min(Math.max(cols, 60), 120);
}

export function clip(text, max) {
  const one = String(text || "").replace(/\s+/g, " ").trim();
  if (one.length <= max) return one;
  return `${one.slice(0, max - 1)}…`;
}

export function hr(char = "─") {
  return theme.line + char.repeat(width() - 2) + theme.reset;
}

export const STATUS_LABEL = {
  acordando: "boot do núcleo",
  pronto: "pronta · aguardando ordem",
  pensando: "pensando…",
  trabalhando: "mexendo no seu PC…",
  falando: "escrevendo resposta…",
  conectando: "abrindo canal Cursor…",
  conectado: "canal Cursor ativo",
  "na tela": "painel visual ativo",
  lembrei: "memória gravada",
  "sem cursor": "aguardando /conectar",
  erro: "falha no protocolo",
  desligando: "encerrando sessão",
};

export function statusText(raw) {
  return STATUS_LABEL[raw] || raw || "online";
}
