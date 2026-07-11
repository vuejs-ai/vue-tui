import { execFileSync } from "node:child_process";
import process from "node:process";
import { describe, expect, test } from "vite-plus/test";
import term from "./helpers/term.ts";

const SHOW_CURSOR = "\x1b[?25h";
const NEXT_LINE = "\x1bE";
const ENTER_ALT_SCREEN = "\x1b[?1049h";
const EXIT_ALT_SCREEN = "\x1b[?1049l";
const ENABLE_PASTE = "\x1b[?2004h";
const DISABLE_PASTE = "\x1b[?2004l";
const ENABLE_KITTY = "\x1b[>1u";
const DISABLE_KITTY = "\x1b[<u";
const ENABLE_DRAG_MOUSE = "\x1b[?1002h";
const DISABLE_DRAG_MOUSE = "\x1b[?1002l";
const ENABLE_SGR_MOUSE = "\x1b[?1006h";
const DISABLE_SGR_MOUSE = "\x1b[?1006l";

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

function processState(pid: number): string | null {
  try {
    return execFileSync("ps", ["-o", "state=", "-p", String(pid)], {
      encoding: "utf8",
    }).trim();
  } catch {
    return null;
  }
}

async function waitForStopped(pid: number, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastState: string | null = null;
  while (Date.now() < deadline) {
    lastState = processState(pid);
    if (lastState?.startsWith("T")) return;
    await delay(20);
  }
  throw new Error(`process ${pid} did not enter stopped state T; last state was ${lastState}`);
}

async function waitForExitInfo(
  child: ReturnType<typeof term>,
  timeoutMs: number,
): Promise<boolean> {
  return Promise.race([
    child.waitForExitInfo().then(() => true),
    delay(timeoutMs).then(() => false),
  ]);
}

async function cleanupChild(child: ReturnType<typeof term>): Promise<void> {
  if (child.exited) return;

  // SIGTERM can remain pending for a stopped process, so always continue first.
  child.killNow("SIGCONT");
  child.write("q");
  if (await waitForExitInfo(child, 500)) return;

  child.killNow("SIGTERM");
  if (await waitForExitInfo(child, 1500)) return;

  child.killNow("SIGCONT");
  child.killNow("SIGKILL");
  await waitForExitInfo(child, 1500);
}

function expectNoDestructiveInlineControl(output: string): void {
  expect(output).not.toContain("\x1b[2J");
  expect(output).not.toContain("\x1b[3J");
  expect(output).not.toContain("\x1b[H");
  expect(output).not.toContain("\x1b[1;1H");
}

const describePosix = process.platform === "win32" ? describe.skip : describe;

describePosix("external suspension", () => {
  test("Inline releases the terminal, preserves history, and repaints after SIGCONT", async () => {
    const child = term("suspension", ["16", "inline"]);

    try {
      await child.waitForOutput((output) => output.includes("__READY__:inline:"));
      await child.waitForOutput((output) => output.includes("INLINE_SNAPSHOT:100x16"));
      await delay(50);

      const suspendOffset = child.output.length;
      child.killNow("SIGTSTP");
      await waitForStopped(child.pid);
      await child.waitForOutput((output) => {
        const suspended = output.slice(suspendOffset);
        return suspended.includes(SHOW_CURSOR) && suspended.includes(NEXT_LINE);
      });

      const suspendedOutput = child.output.slice(suspendOffset);
      expect(suspendedOutput).toContain(SHOW_CURSOR);
      expect(suspendedOutput).toContain(NEXT_LINE);
      expect(suspendedOutput).toContain(DISABLE_PASTE);
      expect(suspendedOutput).toContain(DISABLE_KITTY);
      expectNoDestructiveInlineControl(suspendedOutput);

      await child.resize(72, 12);
      const continueOffset = child.output.length;
      child.killNow("SIGCONT");
      await child.waitForOutput((output) => {
        const resumed = output.slice(continueOffset);
        return (
          resumed.includes("INLINE_SNAPSHOT:72x12") &&
          resumed.includes(ENABLE_PASTE) &&
          resumed.includes(ENABLE_KITTY)
        );
      });

      const resumedOutput = child.output.slice(continueOffset);
      expect(resumedOutput).toContain("INLINE_SNAPSHOT:72x12");
      expect(resumedOutput).toContain(ENABLE_PASTE);
      expect(resumedOutput).toContain(ENABLE_KITTY);
      expectNoDestructiveInlineControl(resumedOutput);

      // The final escape is written immediately before raw mode and the stdin
      // listener are reacquired in the same synchronous continuation tail.
      // Let that tail finish before using input as the end-to-end readiness check.
      await delay(20);
      child.write("q");
      await child.waitForExit();
    } finally {
      await cleanupChild(child);
    }
  }, 20_000);

  test("Fullscreen restores the main screen and reacquires its viewport after SIGCONT", async () => {
    const child = term("suspension", ["16", "fullscreen"]);

    try {
      await child.waitForOutput((output) => output.includes("__READY__:fullscreen:"));
      await child.waitForOutput((output) => output.includes("FULLSCREEN_SNAPSHOT:100x16"));
      await delay(50);

      const suspendOffset = child.output.length;
      child.killNow("SIGTSTP");
      await waitForStopped(child.pid);
      await child.waitForOutput((output) => {
        const suspended = output.slice(suspendOffset);
        return suspended.includes(EXIT_ALT_SCREEN) && suspended.includes(SHOW_CURSOR);
      });

      const suspendedOutput = child.output.slice(suspendOffset);
      expect(suspendedOutput).toContain(EXIT_ALT_SCREEN);
      expect(suspendedOutput).toContain(SHOW_CURSOR);
      expect(suspendedOutput).toContain(DISABLE_PASTE);
      expect(suspendedOutput).toContain(DISABLE_KITTY);
      expect(suspendedOutput).toContain(DISABLE_DRAG_MOUSE);
      expect(suspendedOutput).toContain(DISABLE_SGR_MOUSE);

      await child.resize(72, 12);
      const continueOffset = child.output.length;
      child.killNow("SIGCONT");
      await child.waitForOutput((output) => {
        const resumed = output.slice(continueOffset);
        return (
          resumed.includes(ENTER_ALT_SCREEN) &&
          resumed.includes("FULLSCREEN_SNAPSHOT:72x12") &&
          resumed.includes(ENABLE_PASTE) &&
          resumed.includes(ENABLE_KITTY) &&
          resumed.includes(ENABLE_DRAG_MOUSE) &&
          resumed.includes(ENABLE_SGR_MOUSE)
        );
      });

      const resumedOutput = child.output.slice(continueOffset);
      expect(resumedOutput).toContain(ENTER_ALT_SCREEN);
      expect(resumedOutput).toContain("FULLSCREEN_SNAPSHOT:72x12");
      expect(resumedOutput).toContain(ENABLE_PASTE);
      expect(resumedOutput).toContain(ENABLE_KITTY);
      expect(resumedOutput).toContain(ENABLE_DRAG_MOUSE);
      expect(resumedOutput).toContain(ENABLE_SGR_MOUSE);

      await delay(20);
      child.write("q");
      await child.waitForExit();
      expect(child.output.slice(continueOffset)).toContain(EXIT_ALT_SCREEN);
    } finally {
      await cleanupChild(child);
    }
  }, 20_000);
});
