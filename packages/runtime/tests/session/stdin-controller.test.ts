import { PassThrough } from "node:stream";
import { expect, test } from "vite-plus/test";
import {
  createStdinController,
  type ManagedInputSession,
} from "../../src/session/stdin-controller.ts";
import { createTestTerminalBackend } from "../../src/terminal/test/backend.ts";

test("bracketed paste is disabled when its enable write may have succeeded", () => {
  const terminal = createTestTerminalBackend();
  const stdin = new PassThrough();
  const writes: string[] = [];
  const session: ManagedInputSession = {
    prepareManagedInput: () => true,
    isManagedInputReady: true,
    acquireKittyKeyboard: () => () => {},
    isKittyKeyboardReady: true,
    writeTerminal(data, onHandoff, onAttempt) {
      writes.push(data);
      onAttempt?.();
      if (data === "\x1b[?2004h") throw new Error("accepted then threw");
      onHandoff?.();
      return true;
    },
    requestTerminalReconcile() {},
    reportManagedInputFailure() {},
  };
  const controller = createStdinController(terminal, stdin, session, {
    exitOnCtrlC: false,
    exit() {},
  });

  expect(() => controller.setBracketedPasteMode(true)).toThrow("accepted then threw");
  expect(writes).toEqual(["\x1b[?2004h", "\x1b[?2004l"]);
  expect(terminal.isModeHeld("bracketed-paste")).toBe(false);

  controller.dispose();
  stdin.destroy();
});
