#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import process from "node:process";

function run(cmd, args) {
  const result = spawnSync(cmd, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  return result.status ?? 1;
}

const who = spawnSync("npm", ["whoami"], {
  encoding: "utf8",
  shell: process.platform === "win32",
});
if (who.status !== 0) {
  console.error("Not logged in. Run: npm login");
  process.exit(1);
}

console.log(`Logged in as: ${String(who.stdout || "").trim()}`);
if (run("npm", ["run", "check"]) !== 0) process.exit(1);

const code = run("npm", ["publish", "--access", "public"]);
if (code !== 0) {
  console.error('Create org "eve" at https://www.npmjs.com/org/create then retry.');
  process.exit(code);
}
console.log("\nPublished. Run: npx @eve/code\n");
