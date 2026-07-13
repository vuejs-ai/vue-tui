import path from "node:path";
import process from "node:process";
import { startCommandSession, repoRoot, type BasicTemplateSession } from "./basic-template.ts";

export const focusRoutingScenarios = ["inline", "fullscreen"] as const;

export type FocusRoutingScenario = (typeof focusRoutingScenarios)[number];

export function parseFocusRoutingScenario(value: string | undefined): FocusRoutingScenario {
  if (value === undefined) return "inline";
  if ((focusRoutingScenarios as readonly string[]).includes(value)) {
    return value as FocusRoutingScenario;
  }
  throw new Error(
    `unknown focus-routing scenario ${JSON.stringify(value)}; expected one of ${focusRoutingScenarios.join(", ")}`,
  );
}

export function startFocusRoutingSession(
  artifactDir: string,
  scenario: FocusRoutingScenario,
): Promise<BasicTemplateSession> {
  const fixture = path.join(
    repoRoot,
    "packages",
    "runtime-tests",
    "integration",
    "pty",
    "fixtures",
    "focus-routing.tsx",
  );
  return startCommandSession(artifactDir, {
    file: process.execPath,
    args: ["--import=tsx", fixture, scenario, "review"],
    cwd: path.dirname(fixture),
    label: `focus-routing-${scenario}`,
  });
}
