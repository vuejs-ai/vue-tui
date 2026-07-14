import path from "node:path";
import process from "node:process";
import {
  startCommandSession,
  startDirectCommandSession,
  repoRoot,
  type BasicTemplateSession,
} from "./basic-template.ts";

export const selectionCopyScenarios = ["shell", "suspension"] as const;

export type SelectionCopyScenario = (typeof selectionCopyScenarios)[number];

export function parseSelectionCopyScenario(value: string | undefined): SelectionCopyScenario {
  if (value === undefined) return "shell";
  if ((selectionCopyScenarios as readonly string[]).includes(value)) {
    return value as SelectionCopyScenario;
  }
  throw new Error(
    `unknown selection-copy scenario ${JSON.stringify(value)}; expected one of ${selectionCopyScenarios.join(", ")}`,
  );
}

export function startSelectionCopySession(
  artifactDir: string,
  scenario: SelectionCopyScenario,
): Promise<BasicTemplateSession> {
  const fixture = path.join(
    repoRoot,
    "packages",
    "runtime-tests",
    "integration",
    "pty",
    "fixtures",
    "selection-copy.tsx",
  );
  const target = {
    file: process.execPath,
    args: ["--import=tsx", fixture, "review"],
    cwd: path.dirname(fixture),
    label: `selection-copy-${scenario}`,
  };
  return scenario === "suspension"
    ? startDirectCommandSession(artifactDir, target)
    : startCommandSession(artifactDir, target);
}
