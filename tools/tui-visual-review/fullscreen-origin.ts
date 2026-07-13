import path from "node:path";
import process from "node:process";
import { startCommandSession, repoRoot, type BasicTemplateSession } from "./basic-template.ts";

export const fullscreenOriginScenarios = [
  "static",
  "stdout",
  "stderr",
  "console",
  "rerender",
  "overflow",
  "horizontal-overflow",
  "horizontal-left-wide",
  "horizontal-wide",
  "horizontal-transform",
  "target-lifetime",
  "targeted-mouse",
  "screen-reader",
] as const;

export type FullscreenOriginScenario = (typeof fullscreenOriginScenarios)[number];

export function parseFullscreenOriginScenario(value: string | undefined): FullscreenOriginScenario {
  if (value === undefined) return "static";
  if ((fullscreenOriginScenarios as readonly string[]).includes(value)) {
    return value as FullscreenOriginScenario;
  }
  throw new Error(
    `unknown fullscreen-origin scenario ${JSON.stringify(value)}; expected one of ${fullscreenOriginScenarios.join(", ")}`,
  );
}

export function startFullscreenOriginSession(
  artifactDir: string,
  scenario: FullscreenOriginScenario,
): Promise<BasicTemplateSession> {
  const fixture = path.join(
    repoRoot,
    "packages",
    "runtime-tests",
    "integration",
    "pty",
    "fixtures",
    "fullscreen-origin.tsx",
  );
  return startCommandSession(artifactDir, {
    file: process.execPath,
    args: ["--import=tsx", fixture, "18", scenario],
    cwd: path.dirname(fixture),
    label: `fullscreen-origin-${scenario}`,
  });
}
