import path from "node:path";
import process from "node:process";
import { startCommandSession, repoRoot, type BasicTemplateSession } from "./basic-template.ts";

const scrollBoxDir = path.join(repoRoot, "examples", "scroll-box");
const scrollBoxBundle = path.join(scrollBoxDir, "dist", "main.mjs");

export function startScrollBoxSession(artifactDir: string): Promise<BasicTemplateSession> {
  return startCommandSession(artifactDir, {
    file: process.execPath,
    args: [scrollBoxBundle],
    cwd: scrollBoxDir,
    label: "scroll-box",
  });
}
