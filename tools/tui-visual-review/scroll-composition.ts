import path from "node:path";
import process from "node:process";
import { startCommandSession, repoRoot, type BasicTemplateSession } from "./basic-template.ts";

export const scrollCompositionScenarios = ["inline", "fullscreen"] as const;

export type ScrollCompositionScenario = (typeof scrollCompositionScenarios)[number];

export function parseScrollCompositionScenario(
  value: string | undefined,
): ScrollCompositionScenario {
  if (value === undefined) return "inline";
  if ((scrollCompositionScenarios as readonly string[]).includes(value)) {
    return value as ScrollCompositionScenario;
  }
  throw new Error(
    `unknown scroll-composition scenario ${JSON.stringify(value)}; expected one of ${scrollCompositionScenarios.join(", ")}`,
  );
}

export function startScrollCompositionSession(
  artifactDir: string,
  scenario: ScrollCompositionScenario,
): Promise<BasicTemplateSession> {
  const fixture = path.join(
    repoRoot,
    "packages",
    "runtime-tests",
    "integration",
    "pty",
    "fixtures",
    "scroll-composition.tsx",
  );
  return startCommandSession(artifactDir, {
    file: process.execPath,
    args: ["--import=tsx", fixture, scenario, "review"],
    cwd: path.dirname(fixture),
    label: `scroll-composition-${scenario}`,
  });
}
