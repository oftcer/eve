import { clip, hr, paint, statusText, theme as t, width } from "./theme.js";

export class EveConsole {
  constructor() {
    this.mood = "boot";
    this.busy = false;
    this.streamOpen = false;
    this.meta = {
      status: "acordando",
      cursor: "…",
      voice: "on",
      activity: "",
    };
    this.panelLines = 0;
  }

  startAnim() {}
  stopAnim() {}

  setMood(mood) {
    this.mood = mood;
  }

  setMeta(partial) {
    Object.assign(this.meta, partial);
  }

  splash() {
    console.log("");
    console.log(`${t.cyan}${t.bold}  EVE${t.reset}  ${t.muted}// agente no seu PC${t.reset}`);
    console.log(`${t.muted}  canal Cursor · voz · cérebro local${t.reset}`);
    console.log("");
    console.log(this.panel());
    console.log(hr("─"));
    console.log("");
  }

  panel() {
    const infoW = Math.max(32, width() - 12);
    const label = statusText(this.meta.status);
    const lines = [
      `${t.cyan}${t.bold}EVE${t.reset}  ${dot(this.meta.status)} ${paint(label, t.cyan)}`,
      `${t.muted}cursor${t.reset}   ${clip(this.meta.cursor, infoW)}`,
      `${t.muted}voz${t.reset}      ${this.meta.voice === "on" ? paint("feminina · ligada", t.green) : paint("muda", t.muted)}`,
      `${t.muted}agora${t.reset}    ${paint(
        clip(this.meta.activity || "esperando sua ordem", infoW),
        this.meta.activity ? t.blue : t.muted,
      )}`,
    ];
    return lines.map((line) => `${t.bgPanel} ${line}${t.reset}`).join("\n");
  }

  refreshPanel() {
    if (this.panelLines === 0) return;
    const block = this.panel().split("\n");
    process.stdout.write(`\x1b[${this.panelLines}A`);
    for (const line of block) process.stdout.write(`\x1b[2K${line}\n`);
    this.panelLines = block.length;
  }

  mountPanel() {
    const block = this.panel();
    console.log(block);
    this.panelLines = block.split("\n").length;
  }

  user(text) {
    console.log("");
    console.log(box("você", text, t.blue));
  }

  eve(text) {
    console.log("");
    console.log(box("EVE", text, t.cyan));
  }

  system(text) {
    console.log(`${t.muted}› ${text}${t.reset}`);
  }

  tool(label) {
    console.log(`${t.blue}  ▸ ${t.cyan}${label}${t.reset}`);
    this.setMeta({ activity: label });
  }

  streamBegin() {
    if (this.streamOpen) return;
    this.streamOpen = true;
    this.busy = true;
    console.log("");
    process.stdout.write(`${t.cyan}${t.bold}EVE${t.reset} ${t.dim}›${t.reset} `);
  }

  streamWrite(chunk) {
    if (!chunk) return;
    process.stdout.write(chunk);
  }

  streamEnd() {
    if (!this.streamOpen) return;
    this.streamOpen = false;
    this.busy = false;
    process.stdout.write("\n");
  }

  help(text) {
    console.log(text);
  }

  promptLabel() {
    return `${t.bg}${t.cyan}${t.bold} EVE ${t.reset}${t.blue}›${t.reset} `;
  }
}

function dot(status) {
  const s = String(status || "").toLowerCase();
  if (/erro|fail/.test(s)) return paint("●", t.red);
  if (/trabalh|work|pens|think|conect|mex/.test(s)) return paint("●", t.cyan);
  if (/pronto|idle|lembre|happy/.test(s)) return paint("●", t.green);
  return paint("●", t.blue);
}

function box(title, body, color) {
  const w = Math.min(width() - 4, 96);
  const inner = w - 4;
  const lines = wrap(String(body || ""), inner);
  const top = `${color}┌─ ${title} ${"─".repeat(Math.max(1, w - title.length - 5))}┐${t.reset}`;
  const mid = lines.map((line) => `${color}│${t.reset} ${line.padEnd(inner)} ${color}│${t.reset}`);
  const bot = `${color}└${"─".repeat(w - 2)}┘${t.reset}`;
  return [top, ...mid, bot].join("\n");
}

function wrap(text, max) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > max) {
      if (line) lines.push(line);
      line = word.length > max ? word.slice(0, max) : word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}
