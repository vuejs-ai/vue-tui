import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { readPosixRestoration, repoRoot, startBasicTemplateSession } from "./basic-template.ts";
import type { ActionSource, Observation } from "./session.ts";

export interface SmokeResult {
  artifactDir: string;
  mode: "persistent-posix-shell" | "direct-process";
  applicationExitCode: number;
  terminalRestored: boolean | "not-applicable";
  shellInputRestored: boolean | "not-applicable";
  observedScreen: Pick<Observation, "name" | "revision" | "jsonPath" | "pngPath">;
  png: { width: number; height: number; format: string };
}

function defaultArtifactDir(): string {
  const stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
  return path.join(repoRoot, "visual-terminal-results", `basic-template-${stamp}`);
}

function source(observation: Observation, label: string): ActionSource {
  return {
    sourceRevision: observation.revision,
    allowStale: true,
    staleReason: "The reference app clock can advance without changing the intended input target.",
    label,
  };
}

export async function runBasicTemplateSmoke(
  artifactDir = defaultArtifactDir(),
): Promise<SmokeResult> {
  mkdirSync(artifactDir, { recursive: true });
  const { session, mode } = await startBasicTemplateSession(artifactDir);
  let shellClosed = false;
  try {
    // This is deliberately only an infrastructure check. The text predicate proves that the
    // reference app reached a screen the controller can observe; it is not a visual assertion.
    await session.waitForText("0 (+/-", { timeoutMs: 20_000 });
    const observedScreen = await session.observe("smoke-screen");
    const metadata = await sharp(observedScreen.pngPath).metadata();
    if (!metadata.width || !metadata.height || metadata.format !== "png") {
      throw new Error("visual controller did not produce a readable PNG");
    }

    await session.input("q", source(observedScreen, "quit-smoke-application"));

    let applicationExitCode: number;
    let terminalRestored: boolean | "not-applicable";
    let shellInputRestored: boolean | "not-applicable";
    if (mode === "persistent-posix-shell") {
      await session.waitForText("__VT_STTY_AFTER__:", { scope: "all", timeoutMs: 10_000 });
      const afterAppExit = await session.observe("after-app-exit");
      const restoration = readPosixRestoration(session);
      applicationExitCode = restoration.appExitCode;
      terminalRestored = restoration.termiosRestored;
      if (applicationExitCode !== 0)
        throw new Error(`basic-template exited with code ${applicationExitCode}`);
      if (!terminalRestored)
        throw new Error("basic-template did not restore POSIX terminal attributes");

      await session.input(
        "printf '__VT_SHELL_INPUT_OK__\\n'\r",
        source(afterAppExit, "verify-restored-shell-input"),
      );
      await session.waitForText("__VT_SHELL_INPUT_OK__", { scope: "all", timeoutMs: 5000 });
      await session.observe("restored-shell");
      shellInputRestored = true;
      session.sendSystem("exit\r", "exit-restored-shell");
      const shellExit = await session.waitForExit(5000);
      shellClosed = true;
      if (shellExit.exitCode !== 0)
        throw new Error(`reference shell exited with code ${shellExit.exitCode}`);
      session.setApplicationResult({
        exitCode: applicationExitCode,
        terminalRestored,
        shellInputRestored,
        termiosBefore: restoration.termiosBefore,
        termiosAfter: restoration.termiosAfter,
      });
    } else {
      const appExit = await session.waitForExit(10_000);
      applicationExitCode = appExit.exitCode;
      terminalRestored = "not-applicable";
      shellInputRestored = "not-applicable";
      await session.observe("after-app-exit");
      if (applicationExitCode !== 0)
        throw new Error(`basic-template exited with code ${applicationExitCode}`);
      session.setApplicationResult({
        exitCode: applicationExitCode,
        terminalRestored,
        shellInputRestored,
        note: "The cross-platform direct-process path checks emulator modes and process exit; POSIX termios has no Windows equivalent.",
      });
    }

    const status = session.status() as {
      activeBuffer: string;
      cursor: { visible: boolean; shape: string };
      modes: {
        applicationCursorKeys: boolean;
        applicationKeypad: boolean;
        bracketedPaste: boolean;
        insert: boolean;
        mouseTracking: string;
        origin: boolean;
        reverseWraparound: boolean;
        sendFocus: boolean;
        synchronizedOutput: boolean;
        wraparound: boolean;
      };
    };
    if (status.activeBuffer !== "normal")
      throw new Error("terminal did not return to the normal buffer");
    if (!status.cursor.visible)
      throw new Error("terminal cursor remained hidden after application exit");
    if (status.cursor.shape !== "block")
      throw new Error(`terminal cursor shape remained ${status.cursor.shape} after exit`);
    const expectedModes: typeof status.modes = {
      applicationCursorKeys: false,
      applicationKeypad: false,
      bracketedPaste: false,
      insert: false,
      mouseTracking: "none",
      origin: false,
      reverseWraparound: false,
      sendFocus: false,
      synchronizedOutput: false,
      wraparound: true,
    };
    for (const key of Object.keys(expectedModes) as Array<keyof typeof expectedModes>) {
      if (status.modes[key] !== expectedModes[key]) {
        throw new Error(
          `terminal mode ${key} remained ${JSON.stringify(status.modes[key])}; expected ${JSON.stringify(expectedModes[key])}`,
        );
      }
    }

    const result: SmokeResult = {
      artifactDir: path.resolve(artifactDir),
      mode,
      applicationExitCode,
      terminalRestored,
      shellInputRestored,
      observedScreen: {
        name: observedScreen.name,
        revision: observedScreen.revision,
        jsonPath: observedScreen.jsonPath,
        pngPath: observedScreen.pngPath,
      },
      png: { width: metadata.width, height: metadata.height, format: metadata.format },
    };
    writeFileSync(path.join(artifactDir, "smoke.json"), `${JSON.stringify(result, null, 2)}\n`);
    return result;
  } catch (error) {
    session.recordControllerError(
      error instanceof Error ? (error.stack ?? error.message) : String(error),
    );
    throw error;
  } finally {
    await session.close({
      gracefulInput: shellClosed ? undefined : mode === "persistent-posix-shell" ? "q" : undefined,
    });
  }
}

function parseArtifactDir(args: string[]): string | undefined {
  const index = args.indexOf("--artifacts");
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value) throw new Error("--artifacts requires a directory");
  return path.resolve(value);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  runBasicTemplateSmoke(parseArtifactDir(process.argv.slice(2)))
    .then((result) => {
      process.stdout.write(`${JSON.stringify({ ok: true, result })}\n`);
    })
    .catch((error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
      process.exitCode = 1;
    });
}
