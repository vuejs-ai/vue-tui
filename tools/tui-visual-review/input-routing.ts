import path from "node:path";
import process from "node:process";
import { startCommandSession, repoRoot, type BasicTemplateSession } from "./basic-template.ts";

export const inputRoutingScenarios = ["inline", "fullscreen"] as const;

export type InputRoutingScenario = (typeof inputRoutingScenarios)[number];

export function parseInputRoutingScenario(value: string | undefined): InputRoutingScenario {
  if (value === undefined) return "inline";
  if ((inputRoutingScenarios as readonly string[]).includes(value)) {
    return value as InputRoutingScenario;
  }
  throw new Error(
    `unknown input-routing scenario ${JSON.stringify(value)}; expected one of ${inputRoutingScenarios.join(", ")}`,
  );
}

export function startInputRoutingSession(
  artifactDir: string,
  scenario: InputRoutingScenario,
): Promise<BasicTemplateSession> {
  const fixture = path.join(
    repoRoot,
    "packages",
    "runtime-tests",
    "integration",
    "pty",
    "fixtures",
    "input-route-batching.tsx",
  );
  return startCommandSession(artifactDir, {
    file: process.execPath,
    args: ["--import=tsx", fixture, scenario, "review"],
    cwd: path.dirname(fixture),
    label: `input-routing-${scenario}`,
  });
}
