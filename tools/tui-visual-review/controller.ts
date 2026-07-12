// Repository-internal JSONL entry point for agent-driven TUI visual review.
import path from "node:path";
import process from "node:process";
import readline from "node:readline";
import { readPosixRestoration, repoRoot, startBasicTemplateSession } from "./basic-template.ts";
import {
  parseFullscreenOriginScenario,
  startFullscreenOriginSession,
} from "./fullscreen-origin.ts";
import { parseInputRoutingScenario, startInputRoutingSession } from "./input-routing.ts";
import type { ActionSource, VisualTerminalSession } from "./session.ts";

type ReviewTarget = "basic-template" | "fullscreen-origin" | "input-routing";

interface Request {
  id?: string | number | null;
  type?: string;
  name?: string;
  allowUnchanged?: boolean;
  unchangedReason?: string;
  text?: string;
  data?: string;
  key?: string;
  present?: boolean;
  scope?: "viewport" | "all";
  timeoutMs?: number;
  afterRevision?: number;
  sourceRevision?: number;
  allowStale?: boolean;
  staleReason?: string;
  label?: string;
  columns?: number;
  rows?: number;
  lines?: number;
  signal?: string;
}

function reviewTarget(args: string[]): ReviewTarget {
  const index = args.indexOf("--target");
  if (index === -1) return "basic-template";
  const value = args[index + 1];
  if (value === "basic-template" || value === "fullscreen-origin" || value === "input-routing") {
    return value;
  }
  throw new Error(
    `--target must be basic-template, fullscreen-origin, or input-routing, received ${value}`,
  );
}

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value) throw new Error(`${name} requires a value`);
  return value;
}

function defaultArtifactDir(target: ReviewTarget): string {
  const stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
  return path.join(repoRoot, "tui-visual-review-results", `${target}-session-${stamp}`);
}

function artifactDir(args: string[], target: ReviewTarget): string {
  const index = args.indexOf("--artifacts");
  if (index === -1) return defaultArtifactDir(target);
  const value = args[index + 1];
  if (!value) throw new Error("--artifacts requires a directory");
  return path.resolve(value);
}

function actionSource(request: Request): ActionSource {
  if (!Number.isInteger(request.sourceRevision)) {
    throw new Error("state-sensitive actions require the sourceRevision returned by observe");
  }
  return {
    sourceRevision: request.sourceRevision!,
    allowStale: request.allowStale,
    staleReason: request.staleReason,
    label: request.label,
  };
}

function requiredString(value: unknown, name: string): string {
  if (value === undefined) throw new Error(`${name} is required`);
  if (typeof value !== "string") throw new Error(`${name} must be a string`);
  return value;
}

function requiredNumber(value: number | undefined, name: string): number {
  if (value === undefined || !Number.isFinite(value)) throw new Error(`${name} is required`);
  return value;
}

function restoredShellExitInput(
  session: VisualTerminalSession,
  mode: "persistent-posix-shell" | "direct-process",
): string | undefined {
  if (mode !== "persistent-posix-shell") return undefined;
  try {
    readPosixRestoration(session);
    return "exit\r";
  } catch {
    return undefined;
  }
}

async function execute(session: VisualTerminalSession, request: Request): Promise<unknown> {
  switch (request.type) {
    case "observe":
      return session.observe(requiredString(request.name, "name"), {
        allowUnchanged: request.allowUnchanged,
        unchangedReason: request.unchangedReason,
      });
    case "waitForText":
      return session.waitForText(requiredString(request.text, "text"), {
        present: request.present,
        scope: request.scope,
        timeoutMs: request.timeoutMs,
      });
    case "waitForRevision":
      return session.waitForRevision(
        requiredNumber(request.afterRevision, "afterRevision"),
        request.timeoutMs,
      );
    case "input":
      return session.input(requiredString(request.data, "data"), actionSource(request));
    case "key":
      return session.key(requiredString(request.key, "key"), actionSource(request));
    case "paste":
      return session.paste(requiredString(request.text, "text"), actionSource(request));
    case "resize":
      return session.resize(
        requiredNumber(request.columns, "columns"),
        requiredNumber(request.rows, "rows"),
        actionSource(request),
      );
    case "localScroll":
      return session.localScroll(requiredNumber(request.lines, "lines"), actionSource(request));
    case "signal":
      return session.signal(requiredString(request.signal, "signal"), actionSource(request));
    case "status":
      return session.status();
    default:
      throw new Error(`unknown request type ${JSON.stringify(request.type)}`);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const target = reviewTarget(args);
  const outputDir = artifactDir(args, target);
  const scenario =
    target === "fullscreen-origin"
      ? parseFullscreenOriginScenario(option(args, "--scenario"))
      : target === "input-routing"
        ? parseInputRoutingScenario(option(args, "--scenario"))
        : undefined;
  const { session, mode } =
    target === "fullscreen-origin"
      ? await startFullscreenOriginSession(outputDir, parseFullscreenOriginScenario(scenario))
      : target === "input-routing"
        ? await startInputRoutingSession(outputDir, parseInputRoutingScenario(scenario))
        : await startBasicTemplateSession(outputDir);
  process.stdout.write(
    `${JSON.stringify({
      event: "ready",
      target,
      scenario,
      artifactDir: session.artifactDir,
      profilePath: session.profilePath,
      processPath: session.processPath,
      pid: session.pid,
      mode,
      protocol: [
        "waitForText",
        "waitForRevision",
        "observe",
        "input",
        "key",
        "paste",
        "resize",
        "localScroll",
        "signal",
        "status",
        "close",
      ],
    })}\n`,
  );

  const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  let receivedSignal: NodeJS.Signals | null = null;
  let signalCleanup: Promise<void> | null = null;
  const handleSignal = (signal: NodeJS.Signals): void => {
    if (receivedSignal) return;
    receivedSignal = signal;
    input.close();
    signalCleanup = session.close({
      gracefulInput: mode === "persistent-posix-shell" ? "q" : undefined,
    });
  };
  const handleSigint = (): void => handleSignal("SIGINT");
  const handleSigterm = (): void => handleSignal("SIGTERM");
  process.once("SIGINT", handleSigint);
  process.once("SIGTERM", handleSigterm);
  try {
    for await (const line of input) {
      if (!line.trim()) continue;
      let request: Request = {};
      try {
        request = JSON.parse(line) as Request;
        if (request.type === "close") {
          await session.close({
            gracefulInput: restoredShellExitInput(session, mode),
          });
          process.stdout.write(
            `${JSON.stringify({ id: request.id ?? null, ok: true, result: { closed: true } })}\n`,
          );
          input.close();
          return;
        }
        const result = await execute(session, request);
        process.stdout.write(`${JSON.stringify({ id: request.id ?? null, ok: true, result })}\n`);
      } catch (error) {
        const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
        session.recordControllerError(message);
        process.stdout.write(
          `${JSON.stringify({ id: request.id ?? null, ok: false, error: message })}\n`,
        );
      }
    }
  } finally {
    process.off("SIGINT", handleSigint);
    process.off("SIGTERM", handleSigterm);
    input.close();
    await (signalCleanup ??
      session.close({
        gracefulInput: restoredShellExitInput(session, mode),
      }));
    if (mode === "persistent-posix-shell") {
      try {
        const restoration = readPosixRestoration(session);
        session.setApplicationResult({
          exitCode: restoration.appExitCode,
          terminalRestored: restoration.termiosRestored,
          termiosBefore: restoration.termiosBefore,
          termiosAfter: restoration.termiosAfter,
        });
      } catch {
        // The controller may be closed before the application exits; process.json still records
        // the PTY cleanup, while application restoration remains intentionally absent.
      }
    }
    if (receivedSignal) process.exitCode = receivedSignal === "SIGINT" ? 130 : 143;
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
