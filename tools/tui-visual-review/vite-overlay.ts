import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";
import { repoRoot, startCommandSession, type BasicTemplateSession } from "./basic-template.ts";

const require = createRequire(import.meta.url);

export function startViteOverlaySession(artifactDir: string): Promise<BasicTemplateSession> {
  const fixture = path.join(repoRoot, "packages", "vite", "test", "fixtures", "overlay");
  const launcher = path.join(repoRoot, "packages", "vite", "test", "visual-overlay-launcher.ts");
  return startCommandSession(artifactDir, {
    file: process.execPath,
    args: [require.resolve("tsx/cli"), launcher],
    cwd: fixture,
    label: "vite-overlay",
    env: { VUE_TUI_VISUAL_REVIEW: "1" },
  });
}
