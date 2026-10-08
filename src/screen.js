import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

/**
 * Captura a tela principal (Windows) e devolve PNG em base64.
 */
export async function captureScreen() {
  if (process.platform !== "win32") return null;
  const out = path.join(os.tmpdir(), `eve-screen-${Date.now()}.png`);
  const script = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)
$bmp.Save('${out.replace(/'/g, "''")}', [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
`;
  await new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
      windowsHide: true,
    });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error("screenshot failed"))));
  });
  if (!fs.existsSync(out)) return null;
  const data = fs.readFileSync(out).toString("base64");
  try {
    fs.unlinkSync(out);
  } catch {
    /* ok */
  }
  return { data, mimeType: "image/png" };
}

export function wantsScreen(text) {
  return /tela|screenshot|captura|veja|olha|olhe|mostr|janela|desktop|monitor|vis[aã]o|o que (est[aá]|tem) na tela|enxerg|enxerga|v[eê] (a |o )?(tela|monitor|desktop)/i.test(
    String(text || ""),
  );
}
