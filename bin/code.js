#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const cliUrl = pathToFileURL(path.join(here, "..", "src", "cli.js")).href;

try {
  const { main } = await import(cliUrl);
  await main(process.argv.slice(2));
} catch (error) {
  const msg = error?.message || String(error);
  console.error(`EVE error: ${msg}`);
  if (/Cannot find package|ERR_MODULE_NOT_FOUND|@cursor\/sdk/i.test(msg)) {
    console.error("Fix: cd into the project and run  npm install");
  }
  process.exit(1);
}
