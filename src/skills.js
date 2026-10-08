import fs from "node:fs";
import path from "node:path";
import { brainDir } from "./brain.js";

function skillsDir() {
  const dir = path.join(brainDir(), "skills");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function slug(name) {
  return String(name || "servico")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "servico";
}

/**
 * Gera uma skill + squad de agentes para um serviço pedido.
 */
export function createServiceSkill(serviceName, { providers } = {}) {
  const id = slug(serviceName);
  const dir = path.join(skillsDir(), id);
  fs.mkdirSync(dir, { recursive: true });

  const team = [
    { role: "lead", title: "Lead", job: "orquestra a equipe, define escopo e valida o resultado" },
    { role: "frontend", title: "Frontend", job: "UI, páginas, componentes e experiência" },
    { role: "backend", title: "Backend", job: "APIs, dados, autenticação e lógica de servidor" },
    { role: "qa", title: "QA", job: "testa, encontra bugs e sugere correções" },
  ];

  if (providers?.claude?.enabled) {
    team.push({ role: "claude", title: "Claude", job: "revisão profunda de código e arquitetura" });
  }
  if (providers?.chatgpt?.enabled) {
    team.push({ role: "chatgpt", title: "ChatGPT", job: "ideação, docs e variantes rápidas" });
  }

  const skillMd = `---
name: eve-${id}
description: Equipe EVE para o serviço "${serviceName}". Use quando a pessoa pedir este serviço ou algo relacionado.
---

# Skill: ${serviceName}

Você é a EVE liderando uma **equipe de agentes** para entregar o serviço **${serviceName}**.

## Equipe

${team.map((m) => `- **${m.title}** (\`${m.role}\`): ${m.job}`).join("\n")}

## Protocolo

1. Confirme o objetivo em 1 frase.
2. Divida o trabalho entre os papéis acima (mesmo que você execute todos os papéis em sequência).
3. Use as ferramentas do Cursor: ler/editar arquivos, terminal, busca.
4. Se precisar ver a tela do usuário, peça captura / use a imagem anexada.
5. Entregue algo funcionando e resuma o que cada papel fez.

## Conexões

- Cursor: motor principal (obrigatório)
- Claude: ${providers?.claude?.enabled ? "ativado" : "off"}
- ChatGPT: ${providers?.chatgpt?.enabled ? "ativado" : "off"}
`;

  const teamJson = {
    service: serviceName,
    id,
    createdAt: new Date().toISOString(),
    team,
    providers: {
      cursor: true,
      claude: Boolean(providers?.claude?.enabled),
      chatgpt: Boolean(providers?.chatgpt?.enabled),
    },
  };

  fs.writeFileSync(path.join(dir, "SKILL.md"), skillMd, "utf8");
  fs.writeFileSync(path.join(dir, "team.json"), JSON.stringify(teamJson, null, 2), "utf8");

  // also drop a copy into the project .cursor/skills if cwd is a project
  return { id, dir, team, skillPath: path.join(dir, "SKILL.md") };
}

export function listSkills() {
  const root = skillsDir();
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => {
      const teamPath = path.join(root, d.name, "team.json");
      try {
        return JSON.parse(fs.readFileSync(teamPath, "utf8"));
      } catch {
        return { id: d.name, service: d.name };
      }
    });
}

export function teamBrief(skill) {
  if (!skill?.team?.length) return "";
  return [
    `Equipe montada para "${skill.service}":`,
    ...skill.team.map((m) => `- ${m.title}: ${m.job}`),
    `Skill salva em ${skill.skillPath}`,
    "Execute o plano da equipe agora, papel por papel, até o serviço funcionar.",
  ].join("\n");
}

export function detectServiceRequest(text) {
  const t = String(text || "").trim();
  const m =
    t.match(
      /(?:crie|cria|monte|faz|fa[cç]a|programa|desenvolva|gere)\s+(?:uma|um|o|a)?\s*(?:skill|equipe|time)\s+(?:para|de|do|da)\s+(.+)$/i,
    ) ||
    t.match(/skill\s+(?:para|de)\s+(.+)$/i) ||
    t.match(/equipe\s+(?:para|de|do|da)\s+(.+)$/i) ||
    t.match(
      /(?:crie|cria|monte|faz|fa[cç]a|programa|desenvolva|gere)\s+(?:uma|um|o|a)\s+(?:servi[cç]o|app|aplicativo|site|sistema|loja|api)\s*(?:de|do|da|para)?\s*(.*)$/i,
    );
  if (!m) return null;
  let name = (m[1] || "").replace(/[.!?]+$/g, "").trim();
  // "cria uma skill para X" already captured X; for "cria um serviço de X" keep full remnant
  if (!name && m[0]) name = m[0].slice(0, 80);
  name = name.replace(/^(?:skill|equipe|time)\s+(?:para|de|do|da)\s+/i, "").trim();
  return name.slice(0, 80) || null;
}
