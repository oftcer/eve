import { theme as t } from "./theme.js";

/** Compact EVE frames — white/cyan oval bot */
const FRAMES = {
  idle: [
    [
      `${t.muted}      ╭────────╮${t.reset}`,
      `${t.fg}     │ ${t.cyan}◉${t.fg}    ${t.cyan}◉${t.fg} │${t.reset}`,
      `${t.fg}     │   ${t.cyan}──${t.fg}   │${t.reset}`,
      `${t.fg}    ╱│        │╲${t.reset}`,
      `${t.fg}   ╱ │  ${t.cyan}EVE${t.fg}   │ ╲${t.reset}`,
      `${t.muted}     ╰────────╯${t.reset}`,
    ],
  ],
  think: [
    [
      `${t.muted}      ╭────────╮${t.reset}`,
      `${t.fg}     │ ${t.cyan}❚❚❚${t.fg}  ${t.cyan}❚❚❚${t.fg}│${t.reset}`,
      `${t.fg}     │   ${t.dim}···${t.fg}  │${t.reset}`,
      `${t.fg}    ╱│        │╲${t.reset}`,
      `${t.fg}   ╱ │  ${t.cyan}EVE${t.fg}   │ ╲${t.reset}`,
      `${t.muted}     ╰────────╯${t.reset}`,
    ],
  ],
  work: [
    [
      `${t.muted}      ╭────────╮${t.reset}`,
      `${t.fg}     │ ${t.cyan}●${t.fg}    ${t.cyan}●${t.fg} │${t.reset}`,
      `${t.fg}     │  ${t.blue}▶ ▶${t.fg}  │${t.reset}`,
      `${t.fg}    ╱│        │╲${t.reset}`,
      `${t.fg}   ╱ │  ${t.cyan}EVE${t.fg}   │ ╲${t.reset}`,
      `${t.muted}     ╰────────╯${t.reset}`,
    ],
  ],
  talk: [
    [
      `${t.muted}      ╭────────╮${t.reset}`,
      `${t.fg}     │ ${t.cyan}◕${t.fg}    ${t.cyan}◕${t.fg} │${t.reset}`,
      `${t.fg}     │   ${t.cyan}◡◡${t.fg}  │${t.reset}`,
      `${t.fg}    ╱│        │╲${t.reset}`,
      `${t.fg}   ╱ │  ${t.cyan}EVE${t.fg}   │ ╲${t.reset}`,
      `${t.muted}     ╰────────╯${t.reset}`,
    ],
  ],
  happy: [
    [
      `${t.muted}      ╭────────╮${t.reset}`,
      `${t.fg}     │ ${t.cyan}◕${t.fg}    ${t.cyan}◕${t.fg} │${t.reset}`,
      `${t.fg}     │   ${t.green}♡${t.fg}   │${t.reset}`,
      `${t.fg}    ╱│        │╲${t.reset}`,
      `${t.fg}   ╱ │  ${t.cyan}EVE${t.fg}   │ ╲${t.reset}`,
      `${t.muted}     ╰────────╯${t.reset}`,
    ],
  ],
  wave: [
    [
      `${t.muted}  ╱   ╭────────╮${t.reset}`,
      `${t.fg} ╱    │ ${t.cyan}◕${t.fg}    ${t.cyan}◕${t.fg} │${t.reset}`,
      `${t.fg}     │   ${t.cyan}──${t.fg}   │${t.reset}`,
      `${t.fg}    ╱│        │╲${t.reset}`,
      `${t.fg}   ╱ │  ${t.cyan}EVE${t.fg}   │ ╲${t.reset}`,
      `${t.muted}     ╰────────╯${t.reset}`,
    ],
  ],
  error: [
    [
      `${t.muted}      ╭────────╮${t.reset}`,
      `${t.fg}     │ ${t.red}✕${t.fg}    ${t.red}✕${t.fg} │${t.reset}`,
      `${t.fg}     │   ${t.red}!!${t.fg}  │${t.reset}`,
      `${t.fg}    ╱│        │╲${t.reset}`,
      `${t.fg}   ╱ │  ${t.cyan}EVE${t.fg}   │ ╲${t.reset}`,
      `${t.muted}     ╰────────╯${t.reset}`,
    ],
  ],
};

FRAMES.boot = FRAMES.idle;

export function spriteLines(mood, tick = 0) {
  const set = FRAMES[mood] || FRAMES.idle;
  return set[tick % set.length];
}

export function splashArt() {
  return [
    `${t.bg}${t.cyan}${t.bold}`,
    "  ███████╗██╗   ██╗███████╗",
    "  ██╔════╝██║   ██║██╔════╝",
    "  █████╗  ██║   ██║█████╗  ",
    "  ██╔══╝  ╚██╗ ██╔╝██╔══╝  ",
    "  ███████╗ ╚████╔╝ ███████╗",
    "  ╚══════╝  ╚═══╝  ╚══════╝",
    `${t.reset}`,
    `${t.bg}${t.muted}  agente CLI · canal Cursor · cérebro local${t.reset}`,
  ];
}
