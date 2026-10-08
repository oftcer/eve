/** Preload mínimo — isolamento; painel fala só via HTTP/SSE local. */
const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("eveDesktop", {
  isDesktop: true,
  platform: process.platform,
});
