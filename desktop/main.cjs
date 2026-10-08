/**
 * EVE Desktop — janela própria (Chromium embutido).
 * Não usa Edge/Chrome do sistema; sem popups de sync.
 */
const { app, BrowserWindow, shell, Menu, session } = require("electron");
const path = require("node:path");

const START_URL =
  process.env.EVE_URL ||
  process.argv.find((a) => /^https?:\/\//.test(a)) ||
  "http://127.0.0.1:0/";

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 720,
    minHeight: 520,
    title: "EVE",
    backgroundColor: "#000000",
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  Menu.setApplicationMenu(null);

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    try {
      const u = new URL(url);
      if (u.hostname !== "127.0.0.1" && u.hostname !== "localhost") {
        event.preventDefault();
        shell.openExternal(url);
      }
    } catch {
      event.preventDefault();
    }
  });

  mainWindow.loadURL(START_URL).catch(() => {
    mainWindow.loadURL(
      "data:text/html;charset=utf-8," +
        encodeURIComponent(`<!doctype html><html><body style="margin:0;background:#000;color:#04e9d7;font-family:Consolas,monospace;display:grid;place-items:center;height:100vh">
          <div style="text-align:center;padding:24px">
            <h1 style="letter-spacing:.3em">EVE</h1>
            <p style="color:#7d8aa3">Núcleo offline. Rode <code style="color:#f4f7ff">npm start</code> no terminal e abra de novo.</p>
          </div>
        </body></html>`),
    );
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    // Microfone sem popup chato do Edge — libera media só em localhost
    session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
      const ok =
        permission === "media" ||
        permission === "microphone" ||
        permission === "audioCapture" ||
        permission === "mediaKeySystem";
      callback(ok);
    });
    session.defaultSession.setPermissionCheckHandler((_wc, permission) => {
      return (
        permission === "media" ||
        permission === "microphone" ||
        permission === "audioCapture" ||
        permission === "mediaKeySystem"
      );
    });
    createWindow();
  });

  app.on("window-all-closed", () => {
    app.quit();
  });
}
