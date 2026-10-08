import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { brainDir } from "./brain.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return false;
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const from = path.join(src, name);
    const to = path.join(dest, name);
    const st = fs.statSync(from);
    if (st.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
  return true;
}

function patchVoicePaths(skillDir) {
  const skillMd = path.join(skillDir, "SKILL.md");
  if (!fs.existsSync(skillMd)) return;
  let text = fs.readFileSync(skillMd, "utf8");
  const next = text
    .replace(/~\/\.claude\/instagram\//g, "~/.eve/instagram/")
    .replace(/~\/\.claude\/instagram/g, "~/.eve/instagram");
  if (next !== text) fs.writeFileSync(skillMd, next, "utf8");
}

function writeEveInstagramMeta(eveSkills) {
  const dir = path.join(eveSkills, "eve-instagram");
  fs.mkdirSync(dir, { recursive: true });
  const md = `---
name: eve-instagram
description: >-
  Hub Instagram da EVE. Use para Reels, captions, stories, carrosséis, DMs,
  auditoria de perfil, planejamento e humanização de texto. Skills ig-* no
  mesmo diretório. Nunca publique sem confirmação explícita da pessoa.
---

# eve-instagram

Você está no PC dela com as skills Instagram instaladas em \`~/.eve/skills/\`.

## Skills disponíveis

| Skill | Quando usar |
|-------|-------------|
| \`ig-reel\` | Roteiro de Reel + hooks + beats |
| \`ig-caption\` | Legenda no tom dela |
| \`ig-story\` | Stories |
| \`ig-carousel\` | Carrossel |
| \`ig-dm\` / \`ig-reply\` / \`ig-comment\` | Mensagens e comentários |
| \`ig-plan\` | Planejamento de conteúdo |
| \`ig-profile\` / \`ig-audit\` | Perfil e auditoria |
| \`ig-human\` | Humanizar texto (anti-slop) |
| \`ig-viral\` / \`ig-repurpose\` | Viral / reaproveitar |

## Regras

1. Leia \`~/.eve/instagram/voice.md\` antes de escrever no tom dela.
2. Rode os scripts Python das pastas ig-* (hookscore, beats, humanize) — não invente scores.
3. Entregue texto pronto para copiar; **não poste** sem ela confirmar.
4. Se faltar @ do Instagram nas conexões, peça o @ (Config → API → manual).
`;
  fs.writeFileSync(path.join(dir, "SKILL.md"), md, "utf8");
}

/** Copia skills ig-* + eve-instagram para .cursor/skills do projeto */
export function syncSkillsToCursorProject(projectRoot = root) {
  const eveSkills = path.join(brainDir(), "skills");
  const destRoot = path.join(projectRoot, ".cursor", "skills");
  if (!fs.existsSync(eveSkills)) return [];
  fs.mkdirSync(destRoot, { recursive: true });
  const synced = [];
  for (const name of fs.readdirSync(eveSkills)) {
    if (!name.startsWith("ig-") && name !== "eve-instagram") continue;
    const from = path.join(eveSkills, name);
    if (!fs.statSync(from).isDirectory()) continue;
    if (!fs.existsSync(path.join(from, "SKILL.md"))) continue;
    const to = path.join(destRoot, name);
    copyDir(from, to);
    synced.push(name);
  }
  return synced;
}

export function instagramSkillsReady() {
  const eveSkills = path.join(brainDir(), "skills");
  const need = ["ig-reel", "ig-caption", "ig-human", "eve-instagram"];
  return need.every((n) => fs.existsSync(path.join(eveSkills, n, "SKILL.md")));
}

/** Instala skills Instagram (upstream MIT) em ~/.eve/skills e voice template */
export function ensureBundledSkills() {
  const upstream = path.join(root, "skills", "_instagram-upstream", "skills");
  const localIg = path.join(root, "skills", "instagram");
  const eveSkills = path.join(brainDir(), "skills");
  fs.mkdirSync(eveSkills, { recursive: true });

  const sources = [upstream, localIg].filter((p) => fs.existsSync(p));
  for (const src of sources) {
    for (const name of fs.readdirSync(src)) {
      if (!name.startsWith("ig-")) continue;
      const from = path.join(src, name);
      if (!fs.statSync(from).isDirectory()) continue;
      const to = path.join(eveSkills, name);
      copyDir(from, to);
      patchVoicePaths(to);
    }
  }

  writeEveInstagramMeta(eveSkills);

  const voiceDir = path.join(brainDir(), "instagram");
  fs.mkdirSync(voiceDir, { recursive: true });
  const voice = path.join(voiceDir, "voice.md");
  if (!fs.existsSync(voice)) {
    fs.writeFileSync(
      voice,
      `# Voz da marca (Instagram)

Preencha com o tom do perfil.

- Público:
- Tom:
- Palavras que usa:
- Palavras que evita:
- Exemplos de falas boas:
`,
      "utf8",
    );
  }

  try {
    syncSkillsToCursorProject(root);
  } catch {
    /* ok */
  }

  return eveSkills;
}
