import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import headless from "@xterm/headless";
import { describe, expect, test } from "vite-plus/test";
import term from "./helpers/term.ts";

const require = createRequire(import.meta.url);
const { spawn } = require("node-pty") as typeof import("node-pty");
const { Terminal } = headless;

const ENTER_ALT_SCREEN = "\x1b[?1049h";
const EXIT_ALT_SCREEN = "\x1b[?1049l";
const ENABLE_BRACKETED_PASTE = "\x1b[?2004h";
const DISABLE_BRACKETED_PASTE = "\x1b[?2004l";
const ENABLE_KITTY_KEYBOARD = "\x1b[>1u";
const DISABLE_KITTY_KEYBOARD = "\x1b[<u";
const ENABLE_DRAG_MOUSE = "\x1b[?1002h";
const DISABLE_DRAG_MOUSE = "\x1b[?1002l";
const ENABLE_SGR_MOUSE = "\x1b[?1006h";
const DISABLE_SGR_MOUSE = "\x1b[?1006l";
const HIDE_CURSOR = "\x1b[?25l";
const SHOW_CURSOR = "\x1b[?25h";
const SHIFT_RIGHT = "\x1b[1;2C";
const KITTY_CTRL_SHIFT_C = "\x1b[99;6u";

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function occurrences(value: string, search: string): number {
  return value.split(search).length - 1;
}

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

async function emulate(output: string): Promise<InstanceType<typeof Terminal>> {
  const terminal = new Terminal({ cols: 100, rows: 24, allowProposedApi: true });
  await new Promise<void>((resolve) => terminal.write(output, resolve));
  return terminal;
}

async function visibleScreen(output: string): Promise<string> {
  const terminal = await emulate(output);
  try {
    const buffer = terminal.buffer.active;
    return Array.from({ length: terminal.rows }, (_, row) =>
      (buffer.getLine(buffer.viewportY + row)?.translateToString(true) ?? "").trimEnd(),
    ).join("\n");
  } finally {
    terminal.dispose();
  }
}

async function waitForVisible(
  child: ReturnType<typeof term>,
  included: readonly string[],
  timeoutMs = 10_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let observedLength = -1;
  let visible = "";
  while (Date.now() < deadline) {
    if (child.output.length !== observedLength) {
      observedLength = child.output.length;
      visible = await visibleScreen(child.output);
      if (included.every((value) => visible.includes(value))) return;
    }
    try {
      await child.waitForOutput((output) => output.length > observedLength, deadline - Date.now());
    } catch {
      // Re-evaluate the final output once below for useful assertion diagnostics.
    }
  }
  visible = await visibleScreen(child.output);
  for (const value of included) expect(visible).toContain(value);
}

function expectBalancedTerminalOwnership(output: string, cycles: number): void {
  const completion = output.indexOf("__SELECTION_COPY_OK__");
  expect(completion).toBeGreaterThan(-1);
  for (const [enable, disable] of [
    [ENTER_ALT_SCREEN, EXIT_ALT_SCREEN],
    [ENABLE_BRACKETED_PASTE, DISABLE_BRACKETED_PASTE],
    [ENABLE_KITTY_KEYBOARD, DISABLE_KITTY_KEYBOARD],
    [ENABLE_DRAG_MOUSE, DISABLE_DRAG_MOUSE],
    [ENABLE_SGR_MOUSE, DISABLE_SGR_MOUSE],
  ] as const) {
    expect(occurrences(output, enable)).toBe(cycles);
    expect(occurrences(output, disable)).toBe(cycles);
    expect(output.lastIndexOf(disable)).toBeGreaterThan(output.lastIndexOf(enable));
    expect(output.lastIndexOf(disable)).toBeLessThan(completion);
  }
  expect(output).toContain(HIDE_CURSOR);
  expect(output.lastIndexOf(SHOW_CURSOR)).toBeGreaterThan(output.lastIndexOf(HIDE_CURSOR));
  expect(output.lastIndexOf(SHOW_CURSOR)).toBeLessThan(completion);
}

async function cleanupChild(child: ReturnType<typeof term>): Promise<void> {
  if (child.exited) return;
  child.killNow("SIGCONT");
  child.write("q");
  const exitedWithin = (timeoutMs: number): Promise<boolean> =>
    Promise.race([child.waitForExitInfo().then(() => true), delay(timeoutMs).then(() => false)]);
  if (await exitedWithin(500)) return;
  child.killNow("SIGTERM");
  if (await exitedWithin(1000)) return;
  child.killNow("SIGCONT");
  child.killNow("SIGKILL");
  await exitedWithin(1000);
}

const describePosix = process.platform === "win32" ? describe.skip : describe;

describePosix("Fullscreen selection and copy through a real PTY", () => {
  test("keyboard extension requests exact OSC 52 bytes and survives suspend/resume", async () => {
    const child = term("selection-copy", ["assert"], { name: "xterm-256color" });
    try {
      await child.waitForOutput(
        (output) =>
          output.includes("__READY__") &&
          output.includes(ENTER_ALT_SCREEN) &&
          output.includes(ENABLE_DRAG_MOUSE) &&
          output.includes(ENABLE_SGR_MOUSE),
      );
      await waitForVisible(child, [
        "Fullscreen selection and OSC 52 copy",
        'selection=ready range=none selected=""',
        "copy=not-requested",
      ]);

      child.write(SHIFT_RIGHT);
      await waitForVisible(child, ['selection=ready range=0->1 selected="a"']);
      child.write(SHIFT_RIGHT);
      await waitForVisible(child, ['selection=ready range=0->2 selected="al"']);
      child.write(SHIFT_RIGHT);
      await waitForVisible(child, ['selection=ready range=0->3 selected="alp"']);

      child.write(KITTY_CTRL_SHIFT_C);
      await waitForVisible(child, ['copy=requested text="alp"']);
      const expectedOsc52 = `\x1b]52;c;${Buffer.from("alp").toString("base64")}\x07`;
      expect(occurrences(child.output, expectedOsc52)).toBe(1);

      const suspendOffset = child.output.length;
      child.killNow("SIGTSTP");
      await waitForStopped(child.pid);
      await child.waitForOutput((output) => {
        const transition = output.slice(suspendOffset);
        return (
          transition.includes(EXIT_ALT_SCREEN) &&
          transition.includes(DISABLE_DRAG_MOUSE) &&
          transition.includes(DISABLE_SGR_MOUSE) &&
          transition.includes(DISABLE_BRACKETED_PASTE) &&
          transition.includes(DISABLE_KITTY_KEYBOARD)
        );
      });

      const resumeOffset = child.output.length;
      child.killNow("SIGCONT");
      await child.waitForOutput((output) => {
        const transition = output.slice(resumeOffset);
        return (
          transition.includes(ENTER_ALT_SCREEN) &&
          transition.includes(ENABLE_DRAG_MOUSE) &&
          transition.includes(ENABLE_SGR_MOUSE) &&
          transition.includes(ENABLE_BRACKETED_PASTE) &&
          transition.includes(ENABLE_KITTY_KEYBOARD)
        );
      });
      await waitForVisible(child, [
        'selection=ready range=0->3 selected="alp"',
        'copy=requested text="alp"',
      ]);

      child.write("c");
      await child.waitForOutput((output) => occurrences(output, expectedOsc52) === 2);
      child.write("q");
      await child.waitForOutput((output) => output.includes("__SELECTION_COPY_OK__"));
      await child.waitForExit();
      expectBalancedTerminalOwnership(child.output, 2);

      const terminal = await emulate(child.output);
      try {
        expect(terminal.buffer.active.type).toBe("normal");
        expect(terminal.modes.bracketedPasteMode).toBe(false);
        expect(terminal.modes.mouseTrackingMode).toBe("none");
      } finally {
        terminal.dispose();
      }
    } finally {
      await cleanupChild(child);
    }
  }, 20_000);

  test("pointer drag selects wide Unicode across a soft wrap and copies it exactly", async () => {
    const child = term("selection-copy", ["assert"], { name: "xterm-256color" });
    try {
      await child.waitForOutput((output) => output.includes("__READY__"));
      await waitForVisible(child, ["alpha 你🙂 beta", "gamma delta"]);

      // Wire coordinates are one-based. The target starts at screen row 6;
      // drag from the wide CJK grapheme on its first row into the wrapped row.
      child.write("\x1b[<0;7;6M");
      child.write("\x1b[<32;5;7M");
      child.write("\x1b[<0;5;7m");
      const selected = "你🙂 beta gamma";
      await waitForVisible(child, [`selected=${JSON.stringify(selected)}`]);

      child.write("c");
      await waitForVisible(child, [`copy=requested text=${JSON.stringify(selected)}`]);
      expect(child.output).toContain(`\x1b]52;c;${Buffer.from(selected).toString("base64")}\x07`);

      child.write("q");
      await child.waitForOutput((output) => output.includes("__SELECTION_COPY_OK__"));
      await child.waitForExit();
      expectBalancedTerminalOwnership(child.output, 1);
    } finally {
      await cleanupChild(child);
    }
  });

  test("the restored parent shell accepts input after the application exits", async () => {
    const fixture = fileURLToPath(new URL("./fixtures/selection-copy.tsx", import.meta.url));
    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
      CI: "false",
      FORCE_COLOR: "3",
      NODE_NO_WARNINGS: "1",
    };
    const shell = spawn("/bin/sh", [], {
      name: "xterm-256color",
      cols: 100,
      rows: 24,
      cwd: path.dirname(fixture),
      env,
    });
    let output = "";
    let exited = false;
    let exitResolve!: () => void;
    const exitPromise = new Promise<void>((resolve) => {
      exitResolve = resolve;
    });
    const watchers = new Set<() => void>();
    const waitForOutput = (predicate: (value: string) => boolean, timeoutMs = 10_000) =>
      new Promise<void>((resolve, reject) => {
        const check = (): void => {
          if (!predicate(output)) return;
          clearTimeout(timer);
          watchers.delete(check);
          resolve();
        };
        const timer = setTimeout(() => {
          watchers.delete(check);
          reject(new Error(`timed out waiting for shell PTY output: ${JSON.stringify(output)}`));
        }, timeoutMs);
        watchers.add(check);
        check();
      });
    shell.onData((data) => {
      output += data;
      for (const watcher of watchers) watcher();
    });
    shell.onExit(() => {
      exited = true;
      exitResolve();
    });
    const shellQuote = (value: string): string => `'${value.replaceAll("'", `'"'"'`)}'`;
    const launch = [process.execPath, "--import=tsx", fixture, "assert"].map(shellQuote).join(" ");
    const command = [
      "__vt_before=$(stty -g)",
      launch,
      "__vt_code=$?",
      "__vt_after=$(stty -g)",
      'printf \'\\n__VT_APP_EXIT__:%s\\n__VT_STTY_BEFORE__:%s\\n__VT_STTY_AFTER__:%s\\n\' "$__vt_code" "$__vt_before" "$__vt_after"',
    ].join("; ");

    try {
      shell.write(`${command}\r`);
      await waitForOutput((value) => value.includes("__READY__"));
      shell.write("q");
      await waitForOutput((value) => value.includes("__VT_APP_EXIT__:0"));
      shell.write("printf '__SELECTION_%s_OK__\\n' SHELL\r");
      await waitForOutput((value) => value.includes("__SELECTION_SHELL_OK__"));
      shell.write("exit\r");
      await exitPromise;

      const before = Array.from(output.matchAll(/__VT_STTY_BEFORE__:([^\r\n]+)/g)).at(-1)?.[1];
      const after = Array.from(output.matchAll(/__VT_STTY_AFTER__:([^\r\n]+)/g)).at(-1)?.[1];
      expect(before).toBeTruthy();
      expect(after).toBe(before);
      const terminal = await emulate(output);
      try {
        expect(terminal.buffer.active.type).toBe("normal");
        expect(terminal.modes.mouseTrackingMode).toBe("none");
        const buffer = terminal.buffer.active;
        const text = Array.from({ length: buffer.length }, (_, row) =>
          buffer.getLine(row)?.translateToString(true),
        ).join("\n");
        expect(text).toContain("__SELECTION_SHELL_OK__");
      } finally {
        terminal.dispose();
      }
    } finally {
      if (!exited) shell.kill("SIGKILL");
    }
  });
});
