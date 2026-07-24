import path from "node:path";
import process from "node:process";
import { startCommandSession, repoRoot, type BasicTemplateSession } from "./basic-template.ts";

export function startInlineHistorySession(artifactDir: string): Promise<BasicTemplateSession> {
  const fixture = path.join(
    repoRoot,
    "packages",
    "runtime-tests",
    "integration",
    "pty",
    "fixtures",
    "inline-overflow-comparison.tsx",
  );
  return startCommandSession(artifactDir, {
    file: process.execPath,
    args: ["--import=tsx", fixture, "8", "static-tail"],
    cwd: path.dirname(fixture),
    label: "inline-history-static-tail",
  });
}
