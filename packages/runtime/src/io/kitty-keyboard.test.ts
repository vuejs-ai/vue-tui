import EventEmitter from "node:events";
import { describe, expect, test, vi } from "vite-plus/test";
import {
  createKittyKeyboardController,
  type StartKittyQueryResponseDetection,
  type WriteKittyOutput,
} from "./kitty-keyboard.ts";

const noQueryDetection: StartKittyQueryResponseDetection = () => () => {};

function createFakeStdout(): { stdout: NodeJS.WriteStream; written: string[] } {
  const stdout = new EventEmitter() as unknown as NodeJS.WriteStream;
  stdout.columns = 100;
  (stdout as { isTTY?: boolean }).isTTY = true;
  const written: string[] = [];
  stdout.write = ((data: string) => {
    written.push(data);
    return true;
  }) as typeof stdout.write;
  return { stdout, written };
}

function createFakeStdin(): NodeJS.ReadStream {
  const stdin = new EventEmitter() as unknown as NodeJS.ReadStream;
  (stdin as { isTTY?: boolean }).isTTY = true;
  return stdin;
}

function createEnabledController(writeOutput?: WriteKittyOutput, onStateChange?: () => void) {
  return createKittyKeyboardController(
    createFakeStdin(),
    createFakeStdout().stdout,
    noQueryDetection,
    { mode: "enabled" },
    writeOutput,
    onStateChange,
  );
}

describe("Kitty keyboard output handoff", () => {
  test("discards an unresolved query detector when the application is disposed", () => {
    const cancel = vi.fn();
    const controller = createKittyKeyboardController(
      createFakeStdin(),
      createFakeStdout().stdout,
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
    const controller = createEnabledController((data, onHandoff) => {
      writes.push(data);
      if (onHandoff) handoffs.push(onHandoff);
      return true;
    });

    const release = controller.acquireDemand();
    expect(controller.isEnabled).toBe(false);
    expect(controller.isReady).toBe(false);

    controller.abandonPendingOutput();
    release();
    await Promise.resolve();
    handoffs[0]?.();

    expect(writes).toEqual(["\x1b[>1u"]);
    expect(controller.isEnabled).toBe(false);
    controller.dispose();
  });

  test("treats a direct Writable false as an accepted handoff", () => {
    const { stdout, written } = createFakeStdout();
    stdout.write = ((data: string) => {
      written.push(data);
      return false;
    }) as typeof stdout.write;
    const controller = createKittyKeyboardController(createFakeStdin(), stdout, noQueryDetection, {
      mode: "enabled",
    });

    controller.acquireDemand();

    expect(written).toEqual(["\x1b[>1u"]);
    expect(controller.isEnabled).toBe(true);
    expect(controller.isReady).toBe(true);
    controller.dispose();
  });

  test("retains blocked demand and reconciles it after the gate accepts writes", async () => {
    const writes: string[] = [];
    let blocked = true;
    let handoff: (() => void) | undefined;
    const onStateChange = vi.fn();
    const controller = createEnabledController((data, onHandoff) => {
      writes.push(data);
      if (blocked) return false;
      handoff = onHandoff;
      return true;
    }, onStateChange);

    const release = controller.acquireDemand();
    expect(writes).toEqual(["\x1b[>1u"]);
    expect(controller.isEnabled).toBe(false);
    expect(controller.isReady).toBe(false);

    blocked = false;
    controller.reconcile();
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
    const controller = createKittyKeyboardController(
      createFakeStdin(),
      createFakeStdout().stdout,
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
    const controller = createEnabledController((data, onHandoff) => {
      writes.push(data);
      if (onHandoff) handoffs.push(onHandoff);
      return true;
    });

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
    const { stdout, written } = createFakeStdout();
    const writes: string[] = [];
    let suspendDuringPush = true;
    let controller!: ReturnType<typeof createKittyKeyboardController>;
    controller = createKittyKeyboardController(
      createFakeStdin(),
      stdout,
      noQueryDetection,
      { mode: "enabled" },
      (data, onHandoff) => {
        writes.push(data);
        if (suspendDuringPush) {
          suspendDuringPush = false;
          controller.suspend(true);
        }
        onHandoff?.();
        return true;
      },
    );

    controller.acquireDemand();

    expect(writes).toEqual(["\x1b[>1u"]);
    expect(written).toEqual(["\x1b[<u"]);
    expect(controller.isEnabled).toBe(false);
    controller.dispose();
  });

  test("preserves synchronous suspend while a captured PUSH waits for handoff", () => {
    const { stdout, written } = createFakeStdout();
    const writes: string[] = [];
    let pushHandoff: (() => void) | undefined;
    const controller = createKittyKeyboardController(
      createFakeStdin(),
      stdout,
      noQueryDetection,
      { mode: "enabled" },
      (data, onHandoff) => {
        writes.push(data);
        pushHandoff = onHandoff;
        return true;
      },
    );

    controller.acquireDemand();
    controller.suspend(true);
    expect(written).toEqual([]);

    pushHandoff?.();
    expect(writes).toEqual(["\x1b[>1u"]);
    expect(written).toEqual(["\x1b[<u"]);
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
    const controller = createKittyKeyboardController(
      createFakeStdin(),
      createFakeStdout().stdout,
      detection,
      { mode: "auto" },
      (data, onHandoff) => {
        writes.push(data);
        if (data === "\x1b[?u") queryHandoff = onHandoff;
        else if (data === "\x1b[>1u") pushHandoff = onHandoff;
        return true;
      },
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
