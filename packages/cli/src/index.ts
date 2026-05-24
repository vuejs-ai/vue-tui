#!/usr/bin/env node

import { existsSync } from "node:fs";
import { dev } from "./dev.ts";

const args = process.argv.slice(2);
const command = args[0];

if (command !== "dev" && command !== undefined) {
  console.error(`Unknown command: ${command}. Usage: vue-tui dev [entry]`);
  process.exit(1);
}

const explicitEntry = args[1];

function resolveEntry(): string | undefined {
  if (explicitEntry) return explicitEntry;
  const conventions = ["src/main.ts", "src/main.tsx", "src/index.ts", "src/index.tsx"];
  return conventions.find((p) => existsSync(p));
}

dev(resolveEntry()).catch((err) => {
  console.error(err);
  process.exit(1);
});
