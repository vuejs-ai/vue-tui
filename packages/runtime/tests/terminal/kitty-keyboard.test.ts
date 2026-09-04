import { describe, expect, test, vi } from "vite-plus/test";
import {
  createKittyKeyboardController,
  type StartKittyQueryResponseDetection,
  type WriteKittyOutput,
} from "../../src/terminal/kitty-keyboard.ts";
import {
  createTestTerminalBackend,
  type TestTerminalBackend,
} from "../../src/terminal/test/backend.ts";

const noQueryDetection: StartKittyQueryResponseDetection = () => () => {};

function terminalWrites(terminal: TestTerminalBackend): string[] {
  return terminal.writes.map(({ data }) => data);
}

/**
 * The protocol push and pop are a mode lease, so they travel through the
 * backend's attached mode writer; the support query still travels through the
 * controller's own output. Both are given the same adapter here so one `writes`
 * array records them in the order the terminal would see.
 */
function attachModeWrites(terminal: TestTerminalBackend, writeOutput?: WriteKittyOutput): void {
  if (!writeOutput) return;
  terminal.attachModeWrites((data, onHandoff, onAttempt) =>
    writeOutput(data, onHandoff, onAttempt),
  );
}

describe("Kitty keyboard output handoff", () => {
  test("discards an unresolved query detector when the application is disposed", () => {
    const cancel = vi.fn();
    const terminal = createTestTerminalBackend();
    const controller = createKittyKeyboardController(
      terminal,
      () => cancel,
      { mode: "auto" },
      (_data, onHandoff) => {
        onHandoff?.();
        return true;
      },
    );

    controller.acquireDemand();
    controller.dispose();

    expect(cancel).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalledWith({ discard: true });
  });

  test("does not own or pop a PUSH abandoned before handoff", async () => {
    const writes: string[] = [];
    const handoffs: Array<() => void> = [];
    const terminal = createTestTerminalBackend();
    const writeOutput: WriteKittyOutput = (data, onHandoff) => {
      writes.push(data);
      if (onHandoff) handoffs.push(onHandoff);
      return true;
    };
    attachModeWrites(terminal, writeOutput);
    const controller = createKittyKeyboardController(
      terminal,
      noQueryDetection,
      { mode: "enabled" },
      writeOutput,
    );

    const release = controller.acquireDemand();
    expect(controller.isEnabled).toBe(false);
    expect(controller.isReady).toBe(false);

    controller.abandonPendingOutput();
    terminal.abandonModeOutput();
    release();
    await Promise.resolve();
    handoffs[0]?.();

    expect(writes).toEqual(["\x1b[>1u"]);
    expect(controller.isEnabled).toBe(false);
    controller.dispose();
  });

  test("pops a PUSH whose physical write may have succeeded before throwing", () => {
    const writes: string[] = [];
    const terminal = createTestTerminalBackend();
    const writeOutput: WriteKittyOutput = (data, onHandoff, onAttempt) => {
      writes.push(data);
      onAttempt?.();
      if (data === "\x1b[>1u") throw new Error("accepted then threw");
      onHandoff?.();
      return true;
    };
    attachModeWrites(terminal, writeOutput);
    const controller = createKittyKeyboardController(
      terminal,
      noQueryDetection,
      { mode: "enabled" },
      writeOutput,
    );

    expect(() => controller.acquireDemand()).toThrow("accepted then threw");

    expect(writes).toEqual(["\x1b[>1u", "\x1b[<u"]);
    expect(controller.isEnabled).toBe(false);
    expect(terminal.isModeHeld("kitty-keyboard")).toBe(false);
    controller.dispose(true);
  });

  test("treats a direct Writable false as an accepted handoff", () => {
    const terminal = createTestTerminalBackend({ writeResults: { stdout: [false] } });
    const controller = createKittyKeyboardController(terminal, noQueryDetection, {
      mode: "enabled",
    });

    controller.acquireDemand();

    expect(terminalWrites(terminal)).toEqual(["\x1b[>1u"]);
    expect(controller.isEnabled).toBe(true);
    expect(controller.isReady).toBe(true);
    expect(terminal.isModeHeld("kitty-keyboard")).toBe(true);
    controller.dispose();
    expect(terminal.isModeHeld("kitty-keyboard")).toBe(false);
  });

  test("retains blocked demand and reconciles it after the gate accepts writes", async () => {
    const writes: string[] = [];
    let blocked = true;
    let handoff: (() => void) | undefined;
    const onStateChange = vi.fn();
    const terminal = createTestTerminalBackend();
    const writeOutput: WriteKittyOutput = (data, onHandoff) => {
      writes.push(data);
      if (blocked) return false;
      handoff = onHandoff;
      return true;
    };
    attachModeWrites(terminal, writeOutput);
    // The protocol is a mode now, so its transitions are reported by the
    // backend exactly as the mounted session wires them.
    terminal.onModeChange(() => onStateChange());
    const controller = createKittyKeyboardController(
      terminal,
      noQueryDetection,
      { mode: "enabled" },
      writeOutput,
      onStateChange,
    );

    const release = controller.acquireDemand();
    expect(writes).toEqual(["\x1b[>1u"]);
    expect(controller.isEnabled).toBe(false);
    expect(controller.isReady).toBe(false);

    blocked = false;
    controller.reconcile();
    // The gate that refused the push belongs to the backend, so the retry does
    // too; the mounted session drives both in one reconcile turn.
    terminal.reconcileModes();
    expect(writes).toEqual(["\x1b[>1u", "\x1b[>1u"]);
    expect(controller.isReady).toBe(false);
    handoff?.();
    expect(controller.isEnabled).toBe(true);
    expect(controller.isReady).toBe(true);
    expect(onStateChange).toHaveBeenCalled();

    release();
    await Promise.resolve();
    handoff?.();
    controller.dispose();
  });

  test("publishes auto readiness only after the query handoff", () => {
    let queryHandoff: (() => void) | undefined;
    const terminal = createTestTerminalBackend();
    const controller = createKittyKeyboardController(
      terminal,
      noQueryDetection,
      { mode: "auto" },
      (data, onHandoff) => {
        expect(data).toBe("\x1b[?u");
        queryHandoff = onHandoff;
        return true;
      },
    );

    controller.acquireDemand();
    expect(controller.isReady).toBe(false);
    queryHandoff?.();
    expect(controller.isReady).toBe(true);
    controller.dispose();
  });

  test("writes POP only after a PUSH became owned", async () => {
    const writes: string[] = [];
    const handoffs: Array<() => void> = [];
    const terminal = createTestTerminalBackend();
    const writeOutput: WriteKittyOutput = (data, onHandoff) => {
      writes.push(data);
      if (onHandoff) handoffs.push(onHandoff);
      return true;
    };
    attachModeWrites(terminal, writeOutput);
    const controller = createKittyKeyboardController(
      terminal,
      noQueryDetection,
      { mode: "enabled" },
      writeOutput,
    );

    const release = controller.acquireDemand();
    release();
    await Promise.resolve();
    expect(writes).toEqual(["\x1b[>1u"]);

    handoffs.shift()?.();
    expect(writes).toEqual(["\x1b[>1u", "\x1b[<u"]);
    expect(controller.isEnabled).toBe(true);
    handoffs.shift()?.();
    expect(controller.isEnabled).toBe(false);
    controller.dispose();
  });

  test("preserves a synchronous suspend requested while PUSH is handed off", () => {
    const terminal = createTestTerminalBackend();
    const writes: string[] = [];
    let suspendDuringPush = true;
    let controller!: ReturnType<typeof createKittyKeyboardController>;
    const writeOutput: WriteKittyOutput = (data, onHandoff) => {
      writes.push(data);
      if (suspendDuringPush) {
        suspendDuringPush = false;
        controller.suspend(true);
      }
      onHandoff?.();
      return true;
    };
    attachModeWrites(terminal, writeOutput);
    controller = createKittyKeyboardController(
      terminal,
      noQueryDetection,
      { mode: "enabled" },
      writeOutput,
    );

    controller.acquireDemand();

    expect(writes).toEqual(["\x1b[>1u"]);
    expect(terminalWrites(terminal)).toEqual(["\x1b[<u"]);
    expect(controller.isEnabled).toBe(false);
    controller.dispose();
  });

  test("preserves synchronous suspend while a captured PUSH waits for handoff", () => {
    const terminal = createTestTerminalBackend();
    const writes: string[] = [];
    let pushHandoff: (() => void) | undefined;
    const writeOutput: WriteKittyOutput = (data, onHandoff) => {
      writes.push(data);
      pushHandoff = onHandoff;
      return true;
    };
    attachModeWrites(terminal, writeOutput);
    const controller = createKittyKeyboardController(
      terminal,
      noQueryDetection,
      { mode: "enabled" },
      writeOutput,
    );

    controller.acquireDemand();
    controller.suspend(true);
    expect(terminalWrites(terminal)).toEqual([]);

    pushHandoff?.();
    expect(writes).toEqual(["\x1b[>1u"]);
    expect(terminalWrites(terminal)).toEqual(["\x1b[<u"]);
    expect(controller.isEnabled).toBe(false);
    controller.dispose();
  });

  test("replaces a detector that settles before QUERY handoff", () => {
    const detectionResults: Array<(supported: boolean) => void> = [];
    const detection: StartKittyQueryResponseDetection = (onResult) => {
      detectionResults.push(onResult);
      return () => {};
    };
    const writes: string[] = [];
    let queryHandoff: (() => void) | undefined;
    let pushHandoff: (() => void) | undefined;
    const terminal = createTestTerminalBackend();
    const writeOutput: WriteKittyOutput = (data, onHandoff) => {
      writes.push(data);
      if (data === "\x1b[?u") queryHandoff = onHandoff;
      else if (data === "\x1b[>1u") pushHandoff = onHandoff;
      return true;
    };
    attachModeWrites(terminal, writeOutput);
    const controller = createKittyKeyboardController(
      terminal,
      detection,
      { mode: "auto" },
      writeOutput,
    );

    controller.acquireDemand();
    expect(detectionResults).toHaveLength(1);
    detectionResults[0]!(false);
    expect(detectionResults).toHaveLength(2);
    expect(controller.isReady).toBe(false);

    queryHandoff?.();
    expect(controller.isReady).toBe(true);
    detectionResults[1]!(true);
    expect(writes).toEqual(["\x1b[?u", "\x1b[>1u"]);
    expect(controller.isReady).toBe(false);

    pushHandoff?.();
    expect(controller.isEnabled).toBe(true);
    expect(controller.isReady).toBe(true);
    controller.dispose(true);
  });
});
