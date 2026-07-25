import path from "node:path";
import process from "node:process";
import { startCommandSession, repoRoot, type BasicTemplateSession } from "./basic-template.ts";

export function startVShowSession(artifactDir: string): Promise<BasicTemplateSession> {
  const fixture = path.join(
    repoRoot,
    "packages",
    "runtime-tests",
    "integration",
    "pty",
    "fixtures",
    "v-show.tsx",
  );
  return startCommandSession(artifactDir, {
    file: process.execPath,
    args: ["--import=tsx", fixture],
    cwd: path.dirname(fixture),
    label: "v-show",
  });
}
