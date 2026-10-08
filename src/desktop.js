/**
 * Abre a janela desktop EVE (Electron), sem Edge/Chrome.
 */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mainJs = path.join(root, "desktop", "main.cjs");
const require = createRequire(import.meta.url);

function resolveElectron() {
  try {
    return require("electron");
  } catch {
    return null;
  }
}

export function desktopAvailable() {
  const bin = resolveElectron();
  return Boolean(bin && fs.existsSync(mainJs) && typeof bin === "string");
}

/**
 * @param {string} url  http://127.0.0.1:PORT/
 * @returns {boolean} true se lançou o app desktop
 */
export function openDesktop(url) {
  if (!url || !fs.existsSync(mainJs)) return false;
  const electronBin = resolveElectron();
  if (!electronBin || typeof electronBin !== "string") return false;

  const child = spawn(electronBin, [mainJs, url], {
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      EVE_URL: url,
      ELECTRON_NO_ATTACH_CONSOLE: "1",
    },
    windowsHide: false,
  });
  child.unref();
  return true;
}
