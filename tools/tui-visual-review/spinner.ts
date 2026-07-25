import path from "node:path";
import process from "node:process";
import { startCommandSession, repoRoot, type BasicTemplateSession } from "./basic-template.ts";

const spinnerFixture = path.join(
  repoRoot,
  "packages",
  "runtime-tests",
  "integration",
  "pty",
  "fixtures",
  "spinner-visual-review.ts",
);

export function startSpinnerSession(artifactDir: string): Promise<BasicTemplateSession> {
  return startCommandSession(artifactDir, {
    file: process.execPath,
    args: ["--import=tsx", spinnerFixture],
    cwd: path.dirname(spinnerFixture),
    label: "spinner",
  });
}
