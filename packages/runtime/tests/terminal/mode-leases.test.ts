import { expect, test } from "vite-plus/test";
import type { TerminalBackend } from "../../src/terminal/backend.ts";
import { createTestTerminalBackend } from "../../src/terminal/test/backend.ts";

/** A gate that captures each mode write and hands it off only when asked. */
function createCapturingGate(terminal: TerminalBackend): {
  readonly captured: string[];
  readonly handoffs: Array<() => void>;
  readonly attempts: Array<() => void>;
} {
  const captured: string[] = [];
  const handoffs: Array<() => void> = [];
  const attempts: Array<() => void> = [];
  terminal.attachModeWrites((data, onHandoff, onAttempt) => {
    captured.push(data);
    if (onHandoff) handoffs.push(onHandoff);
    if (onAttempt) attempts.push(onAttempt);
    return true;
  });
  return { captured, handoffs, attempts };
}

test("a mode is restored only once its enable write has been handed off", () => {
  const terminal = createTestTerminalBackend();
  const gate = createCapturingGate(terminal);

  const lease = terminal.acquire("alternate-screen");
  expect(gate.captured).toEqual(["\x1b[?1049h\x1b[H"]);
  expect(terminal.isModeActive("alternate-screen")).toBe(false);

  lease.release();
  expect(gate.captured).toEqual(["\x1b[?1049h\x1b[H"]);

  gate.attempts.shift()?.();
  gate.handoffs.shift()?.();
  expect(gate.captured).toEqual(["\x1b[?1049h\x1b[H", "\x1b[?1049l"]);

  gate.handoffs.shift()?.();
  expect(terminal.isModeActive("alternate-screen")).toBe(false);
  expect(terminal.isModeHeld("alternate-screen")).toBe(false);
});

test("a mode whose enable write throws after reaching the stream is restored", () => {
  const terminal = createTestTerminalBackend();
  const written: string[] = [];
  terminal.attachModeWrites((data, onHandoff, onAttempt) => {
    written.push(data);
    onAttempt?.();
    if (data === "\x1b[?25l") throw new Error("accepted then threw");
    onHandoff?.();
    return true;
  });

  expect(() => terminal.acquire("cursor-visibility")).toThrow("accepted then threw");

  expect(written).toEqual(["\x1b[?25l", "\x1b[?25h"]);
  expect(terminal.isModeHeld("cursor-visibility")).toBe(false);
  expect(terminal.isModeActive("cursor-visibility")).toBe(false);
});

test("an abandoned transaction restores only the mode whose write was attempted", () => {
  const terminal = createTestTerminalBackend();
  const gate = createCapturingGate(terminal);

  terminal.acquire("alternate-screen");
  terminal.acquire("cursor-visibility");
  expect(gate.captured).toEqual(["\x1b[?1049h\x1b[H", "\x1b[?25l"]);

  // The alternate-screen segment started stream.write(); the captured cursor
  // segment did not. Only the former can have changed caller-owned TTY state.
  gate.attempts[0]?.();
  terminal.abandonModeOutput({ physicalStateUncertain: true });

  expect(gate.captured).toEqual(["\x1b[?1049h\x1b[H", "\x1b[?25l", "\x1b[?1049l"]);
});

test("a handed-off mode survives an abandoned later segment", () => {
  const terminal = createTestTerminalBackend();
  const gate = createCapturingGate(terminal);

  const lease = terminal.acquire("alternate-screen");
  gate.attempts.shift()?.();
  gate.handoffs.shift()?.();
  expect(terminal.isModeActive("alternate-screen")).toBe(true);

  terminal.abandonModeOutput({ physicalStateUncertain: true });
  lease.release({ sync: true });

  expect(terminal.writes.map(({ data }) => data)).toEqual(["\x1b[?1049l"]);
});

test("a mode writes nothing to an output that cannot take its bytes", () => {
  const terminal = createTestTerminalBackend({ capabilities: { stdout: { canWrite: false } } });

  const lease = terminal.acquire("cursor-visibility");
  lease.release();

  expect(terminal.writes).toEqual([]);
});

test("the sweep restores every mode the session still owns", () => {
  const terminal = createTestTerminalBackend();
  terminal.acquire("alternate-screen");
  terminal.acquire("cursor-visibility");
  terminal.acquire("bracketed-paste");

  terminal.restoreModes({ sync: true });

  expect(terminal.writes.map(({ data }) => data)).toEqual([
    "\x1b[?1049h\x1b[H",
    "\x1b[?25l",
    "\x1b[?2004h",
    "\x1b[?1049l",
    "\x1b[?25h",
    "\x1b[?2004l",
  ]);
  expect(terminal.isModeHeld("alternate-screen")).toBe(false);
  expect(terminal.isModeHeld("cursor-visibility")).toBe(false);
  expect(terminal.isModeHeld("bracketed-paste")).toBe(false);
});
