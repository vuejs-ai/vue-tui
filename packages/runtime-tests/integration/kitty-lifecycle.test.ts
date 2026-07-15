import { describe, test, expect, vi } from "vite-plus/test";
import EventEmitter from "node:events";
import { PassThrough } from "node:stream";
import {
  createKittyKeyboardController as createInternalKittyKeyboardController,
  createManualSuspensionHost,
  INTERNAL_SUSPENSION_HOST,
  matchKittyQueryResponse,
  hasCompleteKittyQueryResponse,
  stripKittyQueryResponsesAndTrailingPartial,
  resolveFlags,
  useInternalInputRoutingForTest,
  type StartKittyQueryResponseDetection,
} from "@vue-tui/runtime/internal";
import {
  Box,
  Text,
  createApp,
  useInput,
  type InputHandler,
  type KittyKeyboardOptions,
  type TuiApp,
  type TuiInputEvent,
} from "@vue-tui/runtime";
import { useMouseEvent, type TuiMouseWheelEvent } from "@vue-tui/runtime/fullscreen";
import {
  defineComponent,
  h,
  nextTick,
  onErrorCaptured,
  shallowRef,
  type ComponentPublicInstance,
  type ShallowRef,
} from "vue";
import { captureWrites, makeFakeStdin, makeFakeWritable } from "./lifecycle/test-streams.ts";

const textEncoder = new TextEncoder();

function createFakeStdout() {
  const stdout = new EventEmitter() as unknown as NodeJS.WriteStream;
  stdout.columns = 100;
  (stdout as any).isTTY = true;
  const written: string[] = [];
  stdout.write = ((data: string) => {
    written.push(data);
    return true;
  }) as typeof stdout.write;
  return { stdout, written };
}

function createFakeStdin() {
  const stdin = new EventEmitter() as unknown as NodeJS.ReadStream;
  (stdin as any).isTTY = true;
  (stdin as any).setRawMode = vi.fn();
  (stdin as any).setEncoding = vi.fn();
  (stdin as any).read = vi.fn();
  return { stdin };
}

const noQueryDetection: StartKittyQueryResponseDetection = () => () => {};

const continueInputRoute = () => ({
  performed: false,
  continue: true,
  preventDefault: false,
  blockExternal: false,
});

function inputLabel(event: TuiInputEvent): string {
  if (event.kind === "text" || event.kind === "paste") return event.text;
  if (event.kind === "key") return event.key.reportedText ?? "";
  return event.sequence;
}

function namedKeyOrInput(event: TuiInputEvent, name: string): string {
  return event.kind === "key" && event.key.name === name ? name : inputLabel(event);
}

function collectInput(values: string[]): InputHandler {
  return (event) => {
    values.push(inputLabel(event));
    return "continue";
  };
}

function wheelDirection(event: TuiMouseWheelEvent): "up" | "down" | "left" | "right" {
  if (event.delta.y < 0) return "up";
  if (event.delta.y > 0) return "down";
  return event.delta.x < 0 ? "left" : "right";
}

function collectNonPasteInput(values: string[]): InputHandler {
  return (event) => {
    if (event.kind !== "paste") values.push(inputLabel(event));
    return "continue";
  };
}

function collectPaste(values: string[]): InputHandler {
  return (event) => {
    if (event.kind === "paste") values.push(event.text);
    return "continue";
  };
}

const observeInput: InputHandler = () => "continue";

function createKittyKeyboardController(
  stdin: NodeJS.ReadStream,
  stdout: NodeJS.WriteStream,
  startQueryResponseDetection: StartKittyQueryResponseDetection = noQueryDetection,
  options?: KittyKeyboardOptions,
) {
  return createInternalKittyKeyboardController(stdin, stdout, startQueryResponseDetection, options);
}

function createQueryDetectionHarness() {
  let listener: ((supported: boolean) => void) | undefined;
  const start: StartKittyQueryResponseDetection = (onResult) => {
    listener = onResult;
    return () => {
      if (listener === onResult) listener = undefined;
    };
  };
  return {
    start,
    settle(supported: boolean) {
      const current = listener;
      listener = undefined;
      current?.(supported);
    },
  };
}

describe("kitty query/response matching", () => {
  test("matchKittyQueryResponse detects complete response", () => {
    const buf = [...textEncoder.encode("\x1b[?1u")];
    const match = matchKittyQueryResponse(buf, 0);
    expect(match).toEqual({ state: "complete", endIndex: 4 });
  });

  test("matchKittyQueryResponse detects partial response", () => {
    const buf = [...textEncoder.encode("\x1b[?1")];
    const match = matchKittyQueryResponse(buf, 0);
    expect(match).toEqual({ state: "partial" });
  });

  test("matchKittyQueryResponse returns undefined for non-match", () => {
    const buf = [...textEncoder.encode("hello")];
    expect(matchKittyQueryResponse(buf, 0)).toBeUndefined();
  });

  test("matchKittyQueryResponse returns undefined without digits", () => {
    const buf = [...textEncoder.encode("\x1b[?u")];
    expect(matchKittyQueryResponse(buf, 0)).toBeUndefined();
  });

  test("hasCompleteKittyQueryResponse finds response in buffer", () => {
    const buf = [...textEncoder.encode("abc\x1b[?1udef")];
    expect(hasCompleteKittyQueryResponse(buf)).toBe(true);
  });

  test("stripKittyQueryResponsesAndTrailingPartial removes responses", () => {
    const buf = [...textEncoder.encode("a\x1b[?1ub")];
    expect(stripKittyQueryResponsesAndTrailingPartial(buf)).toEqual([...textEncoder.encode("ab")]);
  });

  test("stripKittyQueryResponsesAndTrailingPartial removes trailing partial", () => {
    const buf = [...textEncoder.encode("a\x1b[?1")];
    expect(stripKittyQueryResponsesAndTrailingPartial(buf)).toEqual([...textEncoder.encode("a")]);
  });

  test("resolveFlags computes correct bitmask", () => {
    expect(resolveFlags(["disambiguateEscapeCodes"])).toBe(1);
    expect(resolveFlags(["disambiguateEscapeCodes", "reportEventTypes"])).toBe(3);
  });
});

describe("kitty lifecycle - init/cleanup", () => {
  test("writes enable sequence when mode is enabled", () => {
    const { stdout, written } = createFakeStdout();
    const { stdin } = createFakeStdin();
    const ctrl = createKittyKeyboardController(stdin, stdout, noQueryDetection, {
      mode: "enabled",
    });

    ctrl.acquireDemand();
    expect(written).toContain("\x1b[>1u");
    expect(ctrl.isEnabled).toBe(true);

    ctrl.dispose();
  });

  test("writes disable sequence on dispose", () => {
    const { stdout, written } = createFakeStdout();
    const { stdin } = createFakeStdin();
    const ctrl = createKittyKeyboardController(stdin, stdout, noQueryDetection, {
      mode: "enabled",
    });

    ctrl.acquireDemand();
    ctrl.dispose();
    expect(written).toContain("\x1b[<u");
    expect(ctrl.isEnabled).toBe(false);
  });

  test("suspend retries a one-shot protocol pop rejection before returning", () => {
    const { stdout } = createFakeStdout();
    const { stdin } = createFakeStdin();
    const writes: string[] = [];
    let failFirstPop = true;
    stdout.write = ((data: string) => {
      writes.push(data);
      if (failFirstPop && data === "\x1b[<u") {
        failFirstPop = false;
        throw new Error("kitty pop failed");
      }
      return true;
    }) as typeof stdout.write;
    const ctrl = createKittyKeyboardController(stdin, stdout, noQueryDetection, {
      mode: "enabled",
    });

    ctrl.acquireDemand();
    ctrl.suspend();
    expect(writes).toEqual(["\x1b[>1u", "\x1b[<u", "\x1b[<u"]);
    expect(ctrl.isEnabled).toBe(false);

    ctrl.resume();
    expect(writes.filter((data) => data === "\x1b[>1u")).toHaveLength(2);

    ctrl.dispose();
    expect(writes.filter((data) => data === "\x1b[<u")).toHaveLength(3);
    expect(ctrl.isEnabled).toBe(false);
  });

  test("a reentrant dispose from the enable write pops the acquired protocol", () => {
    const { stdout, written } = createFakeStdout();
    const { stdin } = createFakeStdin();
    let ctrl!: ReturnType<typeof createKittyKeyboardController>;
    stdout.write = ((data: string) => {
      written.push(data);
      if (data === "\x1b[>1u") ctrl.dispose();
      return true;
    }) as typeof stdout.write;
    ctrl = createKittyKeyboardController(stdin, stdout, noQueryDetection, { mode: "enabled" });

    ctrl.acquireDemand();

    expect(written).toEqual(["\x1b[>1u", "\x1b[<u"]);
    expect(ctrl.isEnabled).toBe(false);
  });

  test("a reentrant suspend from the enable write pops and later reacquires the protocol", () => {
    const { stdout, written } = createFakeStdout();
    const { stdin } = createFakeStdin();
    let ctrl!: ReturnType<typeof createKittyKeyboardController>;
    let suspendFromWrite = true;
    stdout.write = ((data: string) => {
      written.push(data);
      if (suspendFromWrite && data === "\x1b[>1u") {
        suspendFromWrite = false;
        ctrl.suspend();
      }
      return true;
    }) as typeof stdout.write;
    ctrl = createKittyKeyboardController(stdin, stdout, noQueryDetection, { mode: "enabled" });

    ctrl.acquireDemand();
    expect(written).toEqual(["\x1b[>1u", "\x1b[<u"]);
    expect(ctrl.isEnabled).toBe(false);

    ctrl.resume();
    expect(written).toEqual(["\x1b[>1u", "\x1b[<u", "\x1b[>1u"]);
    expect(ctrl.isEnabled).toBe(true);

    ctrl.dispose();
    expect(written.at(-1)).toBe("\x1b[<u");
  });

  test("a reentrant resume from the protocol pop reacquires a fresh level", () => {
    const { stdout, written } = createFakeStdout();
    const { stdin } = createFakeStdin();
    let ctrl!: ReturnType<typeof createKittyKeyboardController>;
    let resumeFromPop = true;
    stdout.write = ((data: string) => {
      written.push(data);
      if (resumeFromPop && data === "\x1b[<u") {
        resumeFromPop = false;
        ctrl.resume();
      }
      return true;
    }) as typeof stdout.write;
    ctrl = createKittyKeyboardController(stdin, stdout, noQueryDetection, { mode: "enabled" });

    ctrl.acquireDemand();
    ctrl.suspend();

    expect(written).toEqual(["\x1b[>1u", "\x1b[<u", "\x1b[>1u"]);
    expect(ctrl.isEnabled).toBe(true);
    ctrl.dispose();
  });

  test("a rejected protocol pop with reentrant resume keeps exactly one owned level", () => {
    const { stdout, written } = createFakeStdout();
    const { stdin } = createFakeStdin();
    let ctrl!: ReturnType<typeof createKittyKeyboardController>;
    let depth = 0;
    let rejectFirstPop = true;
    stdout.write = ((data: string) => {
      written.push(data);
      if (data === "\x1b[>1u") {
        depth++;
      } else if (rejectFirstPop && data === "\x1b[<u") {
        rejectFirstPop = false;
        ctrl.resume();
        throw new Error("pop rejected before effect");
      } else if (data === "\x1b[<u") {
        depth--;
      }
      return true;
    }) as typeof stdout.write;
    ctrl = createKittyKeyboardController(stdin, stdout, noQueryDetection, { mode: "enabled" });

    ctrl.acquireDemand();
    ctrl.suspend();
    expect({ depth, enabled: ctrl.isEnabled, written }).toEqual({
      depth: 1,
      enabled: true,
      written: ["\x1b[>1u", "\x1b[<u"],
    });

    ctrl.dispose();
    expect(depth).toBe(0);
    expect(written).toEqual(["\x1b[>1u", "\x1b[<u", "\x1b[<u"]);
  });

  test("a rejected protocol pop with reentrant disposal is retried", () => {
    const { stdout, written } = createFakeStdout();
    const { stdin } = createFakeStdin();
    let ctrl!: ReturnType<typeof createKittyKeyboardController>;
    let depth = 0;
    let rejectFirstPop = true;
    stdout.write = ((data: string) => {
      written.push(data);
      if (data === "\x1b[>1u") {
        depth++;
      } else if (rejectFirstPop && data === "\x1b[<u") {
        rejectFirstPop = false;
        ctrl.dispose();
        throw new Error("pop rejected before effect");
      } else if (data === "\x1b[<u") {
        depth--;
      }
      return true;
    }) as typeof stdout.write;
    ctrl = createKittyKeyboardController(stdin, stdout, noQueryDetection, { mode: "enabled" });

    ctrl.acquireDemand();
    ctrl.suspend();

    expect(depth).toBe(0);
    expect(ctrl.isEnabled).toBe(false);
    expect(written).toEqual(["\x1b[>1u", "\x1b[<u", "\x1b[<u"]);
  });

  test("a rejected enable write does not pop an external protocol level", () => {
    const { stdout, written } = createFakeStdout();
    const { stdin } = createFakeStdin();
    stdout.write = ((data: string) => {
      written.push(data);
      if (data === "\x1b[>1u") throw new Error("kitty push failed");
      return true;
    }) as typeof stdout.write;
    const ctrl = createKittyKeyboardController(stdin, stdout, noQueryDetection, {
      mode: "enabled",
    });

    expect(() => ctrl.acquireDemand()).toThrow("kitty push failed");
    expect(written).toEqual(["\x1b[>1u"]);
    expect(ctrl.isEnabled).toBe(false);
  });

  test("a rejected enable write after reentrant suspension does not pop", () => {
    const { stdout, written } = createFakeStdout();
    const { stdin } = createFakeStdin();
    let ctrl!: ReturnType<typeof createKittyKeyboardController>;
    stdout.write = ((data: string) => {
      written.push(data);
      if (data === "\x1b[>1u") {
        ctrl.suspend();
        throw new Error("kitty push failed");
      }
      return true;
    }) as typeof stdout.write;
    ctrl = createKittyKeyboardController(stdin, stdout, noQueryDetection, { mode: "enabled" });

    expect(() => ctrl.acquireDemand()).toThrow("kitty push failed");
    expect(written).toEqual(["\x1b[>1u"]);
    expect(ctrl.isEnabled).toBe(false);
    ctrl.resume();
    expect(written).toEqual(["\x1b[>1u"]);
    ctrl.dispose();
  });

  test("a rejected enable write after reentrant disposal does not pop", () => {
    const { stdout, written } = createFakeStdout();
    const { stdin } = createFakeStdin();
    let ctrl!: ReturnType<typeof createKittyKeyboardController>;
    stdout.write = ((data: string) => {
      written.push(data);
      if (data === "\x1b[>1u") {
        ctrl.dispose();
        throw new Error("kitty push failed");
      }
      return true;
    }) as typeof stdout.write;
    ctrl = createKittyKeyboardController(stdin, stdout, noQueryDetection, { mode: "enabled" });

    expect(() => ctrl.acquireDemand()).toThrow("kitty push failed");
    expect(written).toEqual(["\x1b[>1u"]);
    expect(ctrl.isEnabled).toBe(false);
    expect(() => ctrl.acquireDemand()).toThrow("after the application unmounted");
  });

  test("a surviving reentrant demand is restored after the outer push fails", async () => {
    const { stdout, written } = createFakeStdout();
    const { stdin } = createFakeStdin();
    let ctrl!: ReturnType<typeof createKittyKeyboardController>;
    let releaseNested: (() => void) | undefined;
    let failFirstPush = true;
    stdout.write = ((data: string) => {
      written.push(data);
      if (failFirstPush && data === "\x1b[>1u") {
        failFirstPush = false;
        releaseNested = ctrl.acquireDemand();
        throw new Error("outer push failed");
      }
      return true;
    }) as typeof stdout.write;
    ctrl = createKittyKeyboardController(stdin, stdout, noQueryDetection, { mode: "enabled" });

    expect(() => ctrl.acquireDemand()).toThrow("outer push failed");
    expect(written).toEqual(["\x1b[>1u", "\x1b[>1u"]);
    expect(ctrl.isEnabled).toBe(true);

    releaseNested!();
    await Promise.resolve();
    expect(written.at(-1)).toBe("\x1b[<u");
    expect(ctrl.isEnabled).toBe(false);
    ctrl.dispose();
  });

  test("dispose retries a one-shot protocol pop failure", () => {
    const { stdout, written } = createFakeStdout();
    const { stdin } = createFakeStdin();
    let failFirstPop = true;
    stdout.write = ((data: string) => {
      written.push(data);
      if (failFirstPop && data === "\x1b[<u") {
        failFirstPop = false;
        throw new Error("first pop failed");
      }
      return true;
    }) as typeof stdout.write;
    const ctrl = createKittyKeyboardController(stdin, stdout, noQueryDetection, {
      mode: "enabled",
    });

    ctrl.acquireDemand();
    ctrl.dispose();

    expect(written).toEqual(["\x1b[>1u", "\x1b[<u", "\x1b[<u"]);
    expect(ctrl.isEnabled).toBe(false);
  });

  test("the final demand release retries a one-shot protocol pop failure", async () => {
    const { stdout, written } = createFakeStdout();
    const { stdin } = createFakeStdin();
    let failFirstPop = true;
    stdout.write = ((data: string) => {
      written.push(data);
      if (failFirstPop && data === "\x1b[<u") {
        failFirstPop = false;
        throw new Error("first pop failed");
      }
      return true;
    }) as typeof stdout.write;
    const ctrl = createKittyKeyboardController(stdin, stdout, noQueryDetection, {
      mode: "enabled",
    });

    const release = ctrl.acquireDemand();
    release();
    await Promise.resolve();

    expect(written).toEqual(["\x1b[>1u", "\x1b[<u", "\x1b[<u"]);
    expect(ctrl.isEnabled).toBe(false);
    ctrl.dispose();
    expect(written).toHaveLength(3);
  });

  test("not enabled when stdin is not TTY", () => {
    const { stdout, written } = createFakeStdout();
    const { stdin } = createFakeStdin();
    (stdin as any).isTTY = false;
    const ctrl = createKittyKeyboardController(stdin, stdout, noQueryDetection, {
      mode: "enabled",
    });

    ctrl.acquireDemand();
    expect(written).not.toContain("\x1b[>1u");
    expect(ctrl.isEnabled).toBe(false);

    ctrl.dispose();
  });

  test("not enabled when stdout is not TTY", () => {
    const { stdout, written } = createFakeStdout();
    (stdout as any).isTTY = false;
    const { stdin } = createFakeStdin();
    const ctrl = createKittyKeyboardController(stdin, stdout, noQueryDetection, {
      mode: "enabled",
    });

    ctrl.acquireDemand();
    expect(written).not.toContain("\x1b[>1u");

    ctrl.dispose();
  });
});

describe("kitty lifecycle - opt-in behavior", () => {
  test("no-op when kittyKeyboard is absent", () => {
    const { stdout, written } = createFakeStdout();
    const { stdin } = createFakeStdin();
    const ctrl = createKittyKeyboardController(stdin, stdout);

    ctrl.acquireDemand();
    expect(written.filter((s) => s.includes("\x1b[>"))).toHaveLength(0);
    expect(ctrl.isEnabled).toBe(false);

    ctrl.dispose();
  });

  test("no-op when mode is disabled", () => {
    const { stdout, written } = createFakeStdout();
    const { stdin } = createFakeStdin();
    const ctrl = createKittyKeyboardController(stdin, stdout, noQueryDetection, {
      mode: "disabled",
    });

    ctrl.acquireDemand();
    expect(written.filter((s) => s.includes("\x1b[>"))).toHaveLength(0);
    expect(ctrl.isEnabled).toBe(false);

    ctrl.dispose();
  });
});

describe("kitty lifecycle - custom flags", () => {
  test("enabled mode with custom flags writes correct bitmask", () => {
    const { stdout, written } = createFakeStdout();
    const { stdin } = createFakeStdin();
    const ctrl = createKittyKeyboardController(stdin, stdout, noQueryDetection, {
      mode: "enabled",
      flags: ["disambiguateEscapeCodes", "reportEventTypes"],
    });

    ctrl.acquireDemand();
    expect(written).toContain("\x1b[>3u");

    ctrl.dispose();
  });

  test("auto mode with custom flags passes them through", () => {
    const { stdout, written } = createFakeStdout();
    const { stdin } = createFakeStdin();
    const detection = createQueryDetectionHarness();

    const ctrl = createKittyKeyboardController(stdin, stdout, detection.start, {
      mode: "auto",
      flags: ["disambiguateEscapeCodes", "reportEventTypes"],
    });
    ctrl.acquireDemand();
    detection.settle(true);

    expect(written).toContain("\x1b[>3u");
    ctrl.dispose();
  });
});

describe("kitty lifecycle - auto-detection", () => {
  test("enables protocol when terminal responds", () => {
    const { stdout, written } = createFakeStdout();
    const { stdin } = createFakeStdin();
    const detection = createQueryDetectionHarness();
    const ctrl = createKittyKeyboardController(stdin, stdout, detection.start, { mode: "auto" });

    ctrl.acquireDemand();
    detection.settle(true);

    expect(written).toContain("\x1b[>1u");
    expect(ctrl.isEnabled).toBe(true);

    ctrl.dispose();
  });

  test("handles synchronous query response", () => {
    const { stdout } = createFakeStdout();
    const { stdin } = createFakeStdin();
    const writtenStrings: string[] = [];
    const detection = createQueryDetectionHarness();

    stdout.write = ((data: string) => {
      writtenStrings.push(data);
      if (data === "\x1b[?u") {
        detection.settle(true);
      }
      return true;
    }) as typeof stdout.write;

    const ctrl = createKittyKeyboardController(stdin, stdout, detection.start, { mode: "auto" });
    ctrl.acquireDemand();

    expect(writtenStrings).toContain("\x1b[>1u");
    ctrl.dispose();
  });

  test("a committed auto demand retries a rejected enable after reentrant acquisition", async () => {
    const { stdout, written } = createFakeStdout();
    const { stdin } = createFakeStdin();
    const detection = createQueryDetectionHarness();
    let ctrl!: ReturnType<typeof createKittyKeyboardController>;
    let releaseNested: (() => void) | undefined;
    let rejectFirstPush = true;
    stdout.write = ((data: string) => {
      written.push(data);
      if (rejectFirstPush && data === "\x1b[>1u") {
        rejectFirstPush = false;
        releaseNested = ctrl.acquireDemand();
        throw new Error("push rejected before effect");
      }
      return true;
    }) as typeof stdout.write;
    ctrl = createKittyKeyboardController(stdin, stdout, detection.start, { mode: "auto" });

    const releaseFirst = ctrl.acquireDemand();
    expect(() => detection.settle(true)).toThrow("push rejected before effect");
    expect(written).toEqual(["\x1b[?u", "\x1b[>1u", "\x1b[>1u"]);
    expect(ctrl.isEnabled).toBe(true);

    releaseFirst();
    releaseNested!();
    await Promise.resolve();
    expect(written.at(-1)).toBe("\x1b[<u");
    expect(ctrl.isEnabled).toBe(false);
    ctrl.dispose();
  });

  test("does not enable after dispose", () => {
    const { stdout, written } = createFakeStdout();
    const { stdin } = createFakeStdin();
    const detection = createQueryDetectionHarness();
    const ctrl = createKittyKeyboardController(stdin, stdout, detection.start, { mode: "auto" });

    ctrl.acquireDemand();
    ctrl.dispose();
    detection.settle(true);

    expect(written.filter((s) => s === "\x1b[>1u")).toHaveLength(0);
  });

  test("a failed resumed query rolls back and can be retried", () => {
    const { stdout, written } = createFakeStdout();
    const { stdin } = createFakeStdin();
    const detection = createQueryDetectionHarness();
    const originalWrite = stdout.write.bind(stdout);
    let failQuery = false;
    stdout.write = ((data: string) => {
      if (failQuery && data === "\x1b[?u") throw new Error("query failed");
      return originalWrite(data);
    }) as typeof stdout.write;
    const ctrl = createKittyKeyboardController(stdin, stdout, detection.start, { mode: "auto" });

    ctrl.acquireDemand();
    ctrl.suspend();
    failQuery = true;
    expect(() => ctrl.resume()).toThrow("query failed");

    failQuery = false;
    ctrl.resume();
    detection.settle(true);
    expect(written).toContain("\x1b[>1u");
    expect(ctrl.isEnabled).toBe(true);

    ctrl.dispose();
  });

  test("same-tick demand replacement retains an enabled protocol level", async () => {
    const { stdout, written } = createFakeStdout();
    const { stdin } = createFakeStdin();
    const ctrl = createKittyKeyboardController(stdin, stdout, noQueryDetection, {
      mode: "enabled",
    });

    const releaseFirst = ctrl.acquireDemand();
    releaseFirst();
    const releaseReplacement = ctrl.acquireDemand();
    await Promise.resolve();

    expect(written).toEqual(["\x1b[>1u"]);

    releaseReplacement();
    await Promise.resolve();
    expect(written).toEqual(["\x1b[>1u", "\x1b[<u"]);
    ctrl.dispose();
  });

  test("same-tick demand replacement retains one pending auto query", async () => {
    const { stdout, written } = createFakeStdout();
    const { stdin } = createFakeStdin();
    let starts = 0;
    let cancels = 0;
    const detection: StartKittyQueryResponseDetection = () => {
      starts++;
      return () => {
        cancels++;
      };
    };
    const ctrl = createKittyKeyboardController(stdin, stdout, detection, { mode: "auto" });

    const releaseFirst = ctrl.acquireDemand();
    releaseFirst();
    const releaseReplacement = ctrl.acquireDemand();
    await Promise.resolve();

    expect(starts).toBe(1);
    expect(cancels).toBe(0);
    expect(written.filter((data) => data === "\x1b[?u")).toHaveLength(1);

    releaseReplacement();
    await Promise.resolve();
    expect(cancels).toBe(1);
    ctrl.dispose();
  });

  test("a surviving reentrant demand restarts an auto query rejected by the outer acquire", async () => {
    const { stdout, written } = createFakeStdout();
    const { stdin } = createFakeStdin();
    const detections: Array<(supported: boolean) => void> = [];
    const detection: StartKittyQueryResponseDetection = (onResult) => {
      detections.push(onResult);
      return () => {};
    };
    let ctrl!: ReturnType<typeof createKittyKeyboardController>;
    let releaseNested: (() => void) | undefined;
    let failFirstQuery = true;
    stdout.write = ((data: string) => {
      written.push(data);
      if (failFirstQuery && data === "\x1b[?u") {
        failFirstQuery = false;
        releaseNested = ctrl.acquireDemand();
        throw new Error("outer query failed");
      }
      return true;
    }) as typeof stdout.write;
    ctrl = createKittyKeyboardController(stdin, stdout, detection, { mode: "auto" });

    expect(() => ctrl.acquireDemand()).toThrow("outer query failed");
    expect(written.filter((data) => data === "\x1b[?u")).toHaveLength(2);
    expect(detections).toHaveLength(2);

    detections[1]!(true);
    expect(ctrl.isEnabled).toBe(true);
    expect(written).toContain("\x1b[>1u");

    releaseNested!();
    await Promise.resolve();
    expect(ctrl.isEnabled).toBe(false);
    expect(written.at(-1)).toBe("\x1b[<u");
    ctrl.dispose();
  });

  test("a demand acquired by detector cancellation retains its new protocol level", async () => {
    const { stdout, written } = createFakeStdout();
    const { stdin } = createFakeStdin();
    let ctrl!: ReturnType<typeof createKittyKeyboardController>;
    let releaseReplacement: (() => void) | undefined;
    let starts = 0;
    const detection: StartKittyQueryResponseDetection = (onResult) => {
      const generation = ++starts;
      if (generation === 2) onResult(true);
      return () => {
        if (generation === 1) releaseReplacement = ctrl.acquireDemand();
      };
    };
    ctrl = createKittyKeyboardController(stdin, stdout, detection, { mode: "auto" });

    const releaseFirst = ctrl.acquireDemand();
    releaseFirst();
    await Promise.resolve();

    expect(starts).toBe(2);
    expect(ctrl.isEnabled).toBe(true);
    expect(written.filter((data) => data === "\x1b[>1u")).toHaveLength(1);
    expect(written.filter((data) => data === "\x1b[<u")).toHaveLength(0);

    releaseReplacement!();
    await Promise.resolve();
    expect(ctrl.isEnabled).toBe(false);
    expect(written.filter((data) => data === "\x1b[<u")).toHaveLength(1);
    ctrl.dispose();
  });

  test("positive auto support is cached across demand lifetimes", async () => {
    const { stdout, written } = createFakeStdout();
    const { stdin } = createFakeStdin();
    const detection = createQueryDetectionHarness();
    const ctrl = createKittyKeyboardController(stdin, stdout, detection.start, { mode: "auto" });

    const releaseFirst = ctrl.acquireDemand();
    detection.settle(true);
    releaseFirst();
    await Promise.resolve();

    const releaseSecond = ctrl.acquireDemand();
    expect(written.filter((data) => data === "\x1b[?u")).toHaveLength(1);
    expect(written.filter((data) => data === "\x1b[>1u")).toHaveLength(2);
    expect(written.filter((data) => data === "\x1b[<u")).toHaveLength(1);

    releaseSecond();
    await Promise.resolve();
    ctrl.dispose();
  });

  test("negative auto support is cached across demand lifetimes", async () => {
    const { stdout, written } = createFakeStdout();
    const { stdin } = createFakeStdin();
    const detection = createQueryDetectionHarness();
    const ctrl = createKittyKeyboardController(stdin, stdout, detection.start, { mode: "auto" });

    const releaseFirst = ctrl.acquireDemand();
    detection.settle(false);
    releaseFirst();
    await Promise.resolve();

    const releaseSecond = ctrl.acquireDemand();
    expect(written.filter((data) => data === "\x1b[?u")).toHaveLength(1);
    expect(written.filter((data) => data === "\x1b[>1u")).toHaveLength(0);

    releaseSecond();
    await Promise.resolve();
    ctrl.dispose();
  });

  test.each([
    ["non-TTY", { isTTY: false }],
    ["destroyed", { destroyed: true }],
    ["ended", { writableEnded: true }],
    ["unwritable", { writable: false }],
  ] as const)("auto mode does not query through %s control output", (_name, state) => {
    const { stdout, written } = createFakeStdout();
    Object.assign(stdout, state);
    const { stdin } = createFakeStdin();
    let detectionStarts = 0;
    const detection: StartKittyQueryResponseDetection = () => {
      detectionStarts++;
      return () => {};
    };
    const ctrl = createKittyKeyboardController(stdin, stdout, detection, { mode: "auto" });

    ctrl.acquireDemand();

    expect(detectionStarts).toBe(0);
    expect(written).toEqual([]);
    ctrl.dispose();
  });

  test("resume reuses confirmed auto support without querying again", () => {
    const { stdout, written } = createFakeStdout();
    const { stdin } = createFakeStdin();
    const detection = createQueryDetectionHarness();
    const ctrl = createKittyKeyboardController(stdin, stdout, detection.start, { mode: "auto" });

    ctrl.acquireDemand();
    detection.settle(true);
    ctrl.suspend();
    ctrl.resume();

    expect(written.filter((data) => data === "\x1b[?u")).toHaveLength(1);
    expect(written.filter((data) => data === "\x1b[>1u")).toHaveLength(2);
    expect(written.filter((data) => data === "\x1b[<u")).toHaveLength(1);
    ctrl.dispose();
  });

  test("resume stays idle when the final demand ended while suspended", async () => {
    const { stdout, written } = createFakeStdout();
    const { stdin } = createFakeStdin();
    let detectionStarts = 0;
    const detection: StartKittyQueryResponseDetection = () => {
      detectionStarts++;
      return () => {};
    };
    const ctrl = createKittyKeyboardController(stdin, stdout, detection, { mode: "auto" });

    const release = ctrl.acquireDemand();
    ctrl.suspend();
    release();
    await Promise.resolve();
    ctrl.resume();

    expect(detectionStarts).toBe(1);
    expect(written.filter((data) => data === "\x1b[?u")).toHaveLength(1);
    expect(written.filter((data) => data === "\x1b[>1u")).toHaveLength(0);
    ctrl.dispose();
  });
});

// --- Render-level integration tests ---

const Dummy = defineComponent(() => () => null);
const InputDummy = defineComponent(() => {
  useInput(observeInput);
  return () => null;
});

describe("kitty lifecycle - mount/unmount integration", () => {
  test("input-free mount with kittyKeyboard enabled writes no protocol sequence", () => {
    const { stdout, written } = createFakeStdout();
    const { stdin } = createFakeStdin();

    const app = createApp(Dummy);
    app.mount({
      stdout: stdout as unknown as NodeJS.WriteStream,
      stdin: stdin as unknown as NodeJS.ReadStream,
      kittyKeyboard: { mode: "enabled" },
    });

    expect(written).not.toContain("\x1b[>1u");
    expect(written).not.toContain("\x1b[?u");
    app.unmount();
  });

  test("an active semantic route enables Kitty and unmount disables it", () => {
    const { stdout, written } = createFakeStdout();
    const { stdin } = createFakeStdin();

    const app = createApp(InputDummy);
    app.mount({
      stdout: stdout as unknown as NodeJS.WriteStream,
      stdin: stdin as unknown as NodeJS.ReadStream,
      kittyKeyboard: { mode: "enabled" },
    });

    expect(written).toContain("\x1b[>1u");
    app.unmount();
    expect(written).toContain("\x1b[<u");
  });

  test("auto Kitty follows semantic demand even when output updates only at teardown", () => {
    const { stdout, written } = createFakeStdout();
    const { stdin } = createFakeStdin();

    const app = createApp(InputDummy);
    app.mount({
      stdout: stdout as unknown as NodeJS.WriteStream,
      stdin: stdin as unknown as NodeJS.ReadStream,
      liveUpdates: false,
      kittyKeyboard: { mode: "auto" },
    });

    expect(written).toContain("\x1b[?u");
    app.unmount();
  });

  test("semantic input remains available when stdout cannot carry Kitty control output", async () => {
    const { stdout, written } = createFakeStdout();
    (stdout as { isTTY?: boolean }).isTTY = false;
    const { stdin } = createFakeStdin();
    (stdin as { ref?: () => NodeJS.ReadStream }).ref = () => stdin;
    (stdin as { unref?: () => NodeJS.ReadStream }).unref = () => stdin;
    const inputs: string[] = [];
    const App = defineComponent(() => {
      useInput(collectInput(inputs));
      return () => null;
    });

    const app = createApp(App);
    app.mount({
      stdout,
      stdin,
      kittyKeyboard: { mode: "auto" },
    });
    stdin.emit("data", "x");
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(inputs).toEqual(["x"]);
    expect(
      (stdin as unknown as { setRawMode: ReturnType<typeof vi.fn> }).setRawMode,
    ).toHaveBeenCalledWith(true);
    expect(stdin.listenerCount("data")).toBe(1);
    expect(written).not.toContain("\x1b[?u");
    expect(written).not.toContain("\x1b[>1u");
    app.unmount();
  });

  test("auto Kitty does not query for an input-free live-output app", () => {
    const { stdout, written } = createFakeStdout();
    const { stdin } = createFakeStdin();

    const app = createApp(Dummy);
    app.mount({
      stdout: stdout as unknown as NodeJS.WriteStream,
      stdin: stdin as unknown as NodeJS.ReadStream,
      liveUpdates: true,
      kittyKeyboard: { mode: "auto" },
    });

    expect(written).not.toContain("\x1b[?u");
    app.unmount();
  });

  test("mount without kittyKeyboard does not write sequences", () => {
    const { stdout, written } = createFakeStdout();
    const { stdin } = createFakeStdin();

    const app = createApp(Dummy);
    app.mount({
      stdout: stdout as unknown as NodeJS.WriteStream,
      stdin: stdin as unknown as NodeJS.ReadStream,
    });

    expect(written.filter((s) => s.includes("\x1b[>"))).toHaveLength(0);
    app.unmount();
  });
});

// --- Query responses must never reach a useInput handler ---
//
// In auto mode StdinController's single physical ingress consumes the one reply
// owned by the outstanding query before application parsing. parseKeypress's
// `ignore` result remains the backstop for enabled mode and late/stray replies.
function mountWithInput(kittyKeyboard: { mode: "auto" | "enabled" | "disabled" }) {
  const { stdout } = createFakeStdout();
  const { stdin } = createFakeStdin();
  (stdin as any).read = vi.fn(() => null);
  (stdin as any).ref = vi.fn();
  (stdin as any).unref = vi.fn();

  const inputs: string[] = [];
  const App = defineComponent(() => {
    useInput(collectInput(inputs));
    return () => h("tui-text", null, "x");
  });

  const app = createApp(App);
  app.mount({
    stdout: stdout as unknown as NodeJS.WriteStream,
    stdin: stdin as unknown as NodeJS.ReadStream,
    kittyKeyboard,
  });
  return { app, stdin, inputs };
}

function mountWithRealInput(kittyKeyboard: { mode: "auto" | "enabled" | "disabled" }) {
  const stdout = makeFakeWritable();
  const writes = captureWrites(stdout);
  const { stream: stdin } = makeFakeStdin();
  const input = stdin as NodeJS.ReadStream & {
    write(chunk: string | Uint8Array): boolean;
  };
  const inputs: string[] = [];
  const App = defineComponent(() => {
    useInput(collectInput(inputs));
    return () => h("tui-text", null, "x");
  });

  const app = createApp(App);
  app.mount({ stdout, stdin, kittyKeyboard });
  return { app, input, inputs, stdout, writes };
}

describe("kitty query-response - end-to-end filtering", () => {
  test("auto mode delivers ordinary input around a query response exactly once and in order", async () => {
    const { app, input, inputs } = mountWithRealInput({ mode: "auto" });
    try {
      input.write("a\x1b[?1ub");
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(inputs).toEqual(["a", "b"]);
    } finally {
      app.unmount();
      input.destroy();
    }
  });

  test("auto mode owns a query response split beyond the ordinary escape timeout", async () => {
    const { app, input, inputs } = mountWithRealInput({ mode: "auto" });
    try {
      input.write("\x1b[?");
      await new Promise<void>((resolve) => setTimeout(resolve, 35));
      input.write("1u");
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(inputs).toEqual([]);
    } finally {
      app.unmount();
      input.destroy();
    }
  });

  test("auto mode delivers ordinary input once when the query times out", async () => {
    const { app, input, inputs } = mountWithRealInput({ mode: "auto" });
    try {
      input.write("a");
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(inputs).toEqual(["a"]);

      await new Promise<void>((resolve) => setTimeout(resolve, 230));
      expect(inputs).toEqual(["a"]);
    } finally {
      app.unmount();
      input.destroy();
    }
  });

  test("auto mode preserves split UTF-8 input exactly once", async () => {
    const { app, input, inputs } = mountWithRealInput({ mode: "auto" });
    try {
      input.write(new Uint8Array([0xf0, 0x9f]));
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(inputs).toEqual([]);

      input.write(new Uint8Array([0x92, 0xa9]));
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(inputs).toEqual(["💩"]);

      await new Promise<void>((resolve) => setTimeout(resolve, 230));
      expect(inputs).toEqual(["💩"]);
    } finally {
      app.unmount();
      input.destroy();
    }
  });

  test("auto mode consumes an incomplete digit-bearing reply on timeout", async () => {
    const { app, input, inputs } = mountWithRealInput({ mode: "auto" });
    try {
      input.write("\x1b[?1");
      await new Promise<void>((resolve) => setTimeout(resolve, 250));
      expect(inputs).toEqual([]);
    } finally {
      app.unmount();
      input.destroy();
    }
  });

  test("auto mode releases an ordinary query prefix on timeout", async () => {
    const { app, input, inputs } = mountWithRealInput({ mode: "auto" });
    try {
      input.write("\x1b[?");
      await new Promise<void>((resolve) => setTimeout(resolve, 250));
      expect(inputs).toEqual(["\x1b[?"]);
    } finally {
      app.unmount();
      input.destroy();
    }
  });

  test.each([
    ["response without digits", "\x1b[?u", "\x1b[?u"],
    ["invalid query-like sequence", "\x1b[?1x", "\x1b[?1x"],
  ])("auto mode preserves %s", async (_name, sequence, expected) => {
    const { app, input, inputs, writes } = mountWithRealInput({ mode: "auto" });
    try {
      input.write(sequence);
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(inputs).toEqual([expected]);
      expect(writes.filter((value) => value === "\x1b[>1u")).toHaveLength(0);
    } finally {
      app.unmount();
      input.destroy();
    }
  });

  test("the last listener pauses framework-owned flowing so idle bytes remain buffered", async () => {
    const stdin = makeRawByteStdin();
    const stdout = makeFakeWritable();
    const visible = shallowRef(true);
    const inputs: string[] = [];
    const Child = defineComponent(() => {
      useInput(collectInput(inputs));
      return () => h("tui-text", null, "input");
    });
    const App = defineComponent(
      () => () => (visible.value ? h(Child) : h("tui-text", null, "idle")),
    );
    const app = createApp(App);
    app.mount({
      stdout,
      stdin,
      patchConsole: false,
      liveUpdates: true,
      maxFps: 0,
      kittyKeyboard: { mode: "disabled" },
    });
    try {
      expect(stdin.readableFlowing).toBe(true);
      visible.value = false;
      await nextTick();

      expect(stdin.listenerCount("data")).toBe(0);
      expect(stdin.readableFlowing).toBe(false);
      stdin.write("x");
      await flushInput();
      expect(inputs).toEqual([]);

      visible.value = true;
      await nextTick();
      await flushInput();
      expect(inputs).toEqual(["x"]);
    } finally {
      app.unmount();
      stdin.destroy();
      stdout.destroy();
    }
  });

  test("an external idle resume takes over flow ownership from the next app lifetime", async () => {
    const stdin = makeRawByteStdin();
    const stdout = makeFakeWritable();
    const visible = shallowRef(true);
    const Child = defineComponent(() => {
      useInput(observeInput);
      return () => h("tui-text", null, "input");
    });
    const App = defineComponent(
      () => () => (visible.value ? h(Child) : h("tui-text", null, "idle")),
    );
    const app = createApp(App);
    app.mount({
      stdout,
      stdin,
      patchConsole: false,
      liveUpdates: true,
      maxFps: 0,
      kittyKeyboard: { mode: "disabled" },
    });
    const externalListener = () => {};
    try {
      visible.value = false;
      await nextTick();
      expect(stdin.readableFlowing).toBe(false);

      stdin.on("data", externalListener);
      stdin.resume();
      stdin.off("data", externalListener);
      expect(stdin.readableFlowing).toBe(true);
      expect(stdin.listenerCount("data")).toBe(0);

      visible.value = true;
      await nextTick();
      visible.value = false;
      await nextTick();

      expect(stdin.listenerCount("data")).toBe(0);
      expect(stdin.readableFlowing).toBe(true);
    } finally {
      app.unmount();
      stdin.destroy();
      stdout.destroy();
    }
  });

  test("detaching the framework preserves an external owner's paused state", async () => {
    const stdin = makeRawByteStdin();
    const stdout = makeFakeWritable();
    const visible = shallowRef(true);
    const Child = defineComponent(() => {
      useInput(observeInput);
      return () => h("tui-text", null, "input");
    });
    const App = defineComponent(
      () => () => (visible.value ? h(Child) : h("tui-text", null, "idle")),
    );
    const app = createApp(App);
    app.mount({
      stdout,
      stdin,
      patchConsole: false,
      liveUpdates: true,
      maxFps: 0,
      kittyKeyboard: { mode: "disabled" },
    });
    const externalListener = () => {};
    try {
      stdin.on("data", externalListener);
      stdin.pause();
      expect(stdin.readableFlowing).toBe(false);

      visible.value = false;
      await nextTick();

      expect(stdin.listenerCount("data")).toBe(1);
      expect(stdin.listeners("data")).toContain(externalListener);
      expect(stdin.readableFlowing).toBe(false);
    } finally {
      stdin.off("data", externalListener);
      app.unmount();
      stdin.destroy();
      stdout.destroy();
    }
  });

  test("auto mode accepts zero as a valid support response", async () => {
    const { app, input, inputs, writes } = mountWithRealInput({ mode: "auto" });
    try {
      input.write("\x1b[?0u");
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(inputs).toEqual([]);
      expect(writes).toContain("\x1b[>1u");
    } finally {
      app.unmount();
      input.destroy();
    }
  });

  test("auto mode accepts a Uint8Array support response", async () => {
    const { app, input, inputs, writes } = mountWithRealInput({ mode: "auto" });
    try {
      input.write(textEncoder.encode("\x1b[?1u"));
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(inputs).toEqual([]);
      expect(writes).toContain("\x1b[>1u");
    } finally {
      app.unmount();
      input.destroy();
    }
  });

  test("auto mode recognizes a response after an ordinary Escape", async () => {
    const { app, input, inputs, writes } = mountWithRealInput({ mode: "auto" });
    try {
      input.write("\x1b\x1b[?1u");
      await new Promise<void>((resolve) => setTimeout(resolve, 30));
      expect(inputs).toEqual([""]);
      expect(writes).toContain("\x1b[>1u");
    } finally {
      app.unmount();
      input.destroy();
    }
  });

  test("auto mode releases an ordinary Escape after the response that settles detection", async () => {
    const { app, input, inputs, writes } = mountWithRealInput({ mode: "auto" });
    try {
      input.write("\x1b[?1u\x1b");
      await new Promise<void>((resolve) => setTimeout(resolve, 30));
      expect(inputs).toEqual([""]);
      expect(writes).toContain("\x1b[>1u");
    } finally {
      app.unmount();
      input.destroy();
    }
  });

  test("auto mode captures a synchronous query response while resuming", async () => {
    const stdout = makeFakeWritable();
    const writes = captureWrites(stdout);
    const { stream: stdin } = makeFakeStdin();
    const suspensionHost = createManualSuspensionHost();
    const inputs: string[] = [];
    const App = defineComponent(() => {
      useInput(collectInput(inputs));
      return () => h("tui-text", null, "x");
    });
    const app = createApp(App);
    const originalWrite = stdout.write.bind(stdout);
    let queryCount = 0;
    stdout.write = ((...args: unknown[]) => {
      const chunk = String(args[0]);
      const result = (originalWrite as (...writeArgs: unknown[]) => boolean)(...args);
      if (chunk === "\x1b[?u" && ++queryCount === 2) {
        stdin.emit("data", "\x1b[?1u");
      }
      return result;
    }) as NodeJS.WriteStream["write"];

    try {
      app.mount({
        stdout,
        stdin,
        kittyKeyboard: { mode: "auto" },
        [INTERNAL_SUSPENSION_HOST]: suspensionHost,
      } as Parameters<TuiApp["mount"]>[0]);
      expect(queryCount).toBe(1);

      await suspensionHost.suspend();
      await suspensionHost.resume();

      expect(queryCount).toBe(2);
      expect(writes).toContain("\x1b[>1u");
      expect(inputs).toEqual([]);
    } finally {
      app.unmount();
      stdin.destroy();
      stdout.destroy();
    }
  });

  test("enabled mode: stray query-response never reaches useInput", () => {
    // No auto-detection runs in enabled mode; parseKeypress is the backstop.
    const { app, stdin, inputs } = mountWithInput({ mode: "enabled" });
    stdin.emit("data", "\x1b[?1u");
    expect(inputs).toEqual([]);
    app.unmount();
  });

  test("auto mode: query-response during detection never reaches useInput", () => {
    // The single ingress consumes the response before application parsing.
    const { app, stdin, inputs } = mountWithInput({ mode: "auto" });
    stdin.emit("data", "\x1b[?1u");
    expect(inputs).toEqual([]);
    app.unmount();
  });

  test("auto mode: query-response after detection settled never reaches useInput", () => {
    const { app, stdin, inputs } = mountWithInput({ mode: "auto" });
    stdin.emit("data", "\x1b[?1u"); // settles detection
    inputs.length = 0;
    stdin.emit("data", "\x1b[?1u"); // stray, late response
    expect(inputs).toEqual([]);
    app.unmount();
  });

  test("enabled mode: query-response split across two chunks never reaches useInput", () => {
    // inputParser reassembles "\x1b[?" + "1u" into a full CSI sequence before
    // dispatch, so parseKeypress's backstop filters it.
    const { app, stdin, inputs } = mountWithInput({ mode: "enabled" });
    stdin.emit("data", "\x1b[?");
    stdin.emit("data", "1u");
    expect(inputs).toEqual([]);
    app.unmount();
  });
});

type WritableTestStdin = NodeJS.ReadStream & {
  write(chunk: string | Uint8Array): boolean;
  isRaw?: boolean;
  setRawMode(mode: boolean): NodeJS.ReadStream;
};

const flushInput = () => new Promise<void>((resolve) => setImmediate(resolve));

async function flushRenderedTarget(): Promise<void> {
  await nextTick();
  await nextTick();
  await flushInput();
  await nextTick();
  await flushInput();
}

async function waitForWrite(writes: readonly string[], expected: string): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (writes.join("").includes(expected)) return;
    await nextTick();
    await flushInput();
  }
  throw new Error(`Timed out waiting for terminal write ${JSON.stringify(expected)}`);
}

function terminalWriteCount(writes: readonly string[], expected: string): number {
  return writes.join("").split(expected).length - 1;
}

async function waitForWriteCount(
  writes: readonly string[],
  expected: string,
  count: number,
): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (terminalWriteCount(writes, expected) >= count) return;
    await nextTick();
    await flushInput();
  }
  throw new Error(
    `Timed out waiting for terminal write ${JSON.stringify(expected)} to occur ${count} times`,
  );
}

function mountInputAppOnStreams({
  stdin,
  stdout,
  kittyMode,
  suspensionHost,
}: {
  stdin: NodeJS.ReadStream;
  stdout: NodeJS.WriteStream;
  kittyMode?: "auto" | "enabled" | "disabled";
  suspensionHost?: ReturnType<typeof createManualSuspensionHost>;
}) {
  const inputs: string[] = [];
  const App = defineComponent(() => {
    useInput(collectInput(inputs));
    return () => h("tui-text", null, "x");
  });
  const app = createApp(App);
  app.mount({
    stdout,
    stdin,
    patchConsole: false,
    liveUpdates: true,
    maxFps: 0,
    ...(kittyMode ? { kittyKeyboard: { mode: kittyMode } } : {}),
    ...(suspensionHost ? { [INTERNAL_SUSPENSION_HOST]: suspensionHost } : {}),
  } as Parameters<TuiApp["mount"]>[0]);
  return { app, inputs };
}

function makeRawByteStdin(): NodeJS.ReadStream & PassThrough {
  const stdin = new PassThrough() as NodeJS.ReadStream & PassThrough;
  Object.assign(stdin, {
    isTTY: true,
    isRaw: false,
    setRawMode(mode: boolean) {
      stdin.isRaw = mode;
      return stdin;
    },
    ref() {},
    unref() {},
  });
  return stdin;
}

describe("kitty query-response - adversarial ingress ordering", () => {
  test("a data-listener acquisition that attaches then throws rolls back exactly", () => {
    const stdout = makeFakeWritable();
    const { stream: stdin } = makeFakeStdin();
    const originalOn = stdin.on.bind(stdin) as unknown as (
      event: string | symbol,
      listener: (...args: unknown[]) => void,
    ) => typeof stdin;
    let failDataOn = true;
    stdin.on = ((event: string | symbol, listener: (...args: unknown[]) => void) => {
      const result = originalOn(event, listener);
      if (event === "data" && failDataOn) {
        failDataOn = false;
        throw new Error("on failed after attach");
      }
      return result;
    }) as typeof stdin.on;
    let selectRoute!: () => () => void;
    const App = defineComponent(() => {
      const routing = useInternalInputRoutingForTest();
      const boundary = routing.registerSemantic({
        id: "boundary",
        handle: continueInputRoute,
      });
      selectRoute = () => routing.select({ activeBoundary: boundary.lease });
      return () => h("tui-text", null, "x");
    });
    const app = createApp(App);

    app.mount({ stdout, stdin, patchConsole: false, liveUpdates: true });
    expect(selectRoute).toThrow("on failed after attach");
    expect(stdin.listenerCount("data")).toBe(0);

    app.unmount();
    stdin.destroy();
    stdout.destroy();
  });

  test("synchronous data from listener acquisition does not recursively attach", () => {
    const stdout = makeFakeWritable();
    const { stream: stdin } = makeFakeStdin();
    const originalOn = stdin.on.bind(stdin) as unknown as (
      event: string | symbol,
      listener: (...args: unknown[]) => void,
    ) => typeof stdin;
    let dataOnCalls = 0;
    stdin.on = ((event: string | symbol, listener: (...args: unknown[]) => void) => {
      const result = originalOn(event, listener);
      if (event === "data" && ++dataOnCalls === 1) stdin.emit("data", "a");
      return result;
    }) as typeof stdin.on;
    const inputs: string[] = [];
    const App = defineComponent(() => {
      useInput(collectInput(inputs));
      return () => h("tui-text", null, "x");
    });
    const app = createApp(App);
    try {
      app.mount({ stdout, stdin, patchConsole: false, liveUpdates: true });

      expect(dataOnCalls).toBe(1);
      expect(inputs).toEqual(["a"]);
    } finally {
      app.unmount();
      stdin.destroy();
      stdout.destroy();
    }
  });

  test("cancelling from an earlier event cannot expose an in-flight reply in the same chunk", async () => {
    const { stream: stdin } = makeFakeStdin();
    const stdoutA = makeFakeWritable();
    const stdoutB = makeFakeWritable();
    const suspensionHost = createManualSuspensionHost();
    const inputsA: string[] = [];
    const AppA = defineComponent(() => {
      useInput((event) => {
        const value = inputLabel(event);
        inputsA.push(value);
        if (value === "a") void suspensionHost.suspend();
        return "continue";
      });
      return () => h("tui-text", null, "a");
    });
    const appA = createApp(AppA);
    appA.mount({
      stdout: stdoutA,
      stdin,
      patchConsole: false,
      liveUpdates: true,
      maxFps: 0,
      kittyKeyboard: { mode: "auto" },
      [INTERNAL_SUSPENSION_HOST]: suspensionHost,
    } as Parameters<TuiApp["mount"]>[0]);
    const b = mountInputAppOnStreams({ stdin, stdout: stdoutB, kittyMode: "disabled" });
    try {
      stdin.emit("data", "a\x1b[?1u");
      await flushInput();

      expect(inputsA).toEqual(["a"]);
      expect(b.inputs).toEqual(["a"]);
    } finally {
      appA.unmount();
      b.app.unmount();
      stdin.destroy();
      stdoutA.destroy();
      stdoutB.destroy();
    }
  });

  test("a cancelled query keeps its FIFO reply slot ahead of a newer query", async () => {
    const { stream: stdin } = makeFakeStdin();
    const input = stdin as WritableTestStdin;
    const stdoutA = makeFakeWritable();
    const stdoutB = makeFakeWritable();
    const writesB = captureWrites(stdoutB);
    const suspensionHost = createManualSuspensionHost();
    const a = mountInputAppOnStreams({
      stdin,
      stdout: stdoutA,
      kittyMode: "auto",
      suspensionHost,
    });
    const b = mountInputAppOnStreams({ stdin, stdout: stdoutB, kittyMode: "auto" });
    try {
      await suspensionHost.suspend();
      input.write("\x1b[?1u\x1b[?1u");
      await flushInput();

      expect(a.inputs).toEqual([]);
      expect(b.inputs).toEqual([]);
      expect(writesB).toContain("\x1b[>1u");
    } finally {
      a.app.unmount();
      b.app.unmount();
      stdin.destroy();
      stdoutA.destroy();
      stdoutB.destroy();
    }
  });

  test("a cancelled query tombstone retains a split query-shaped late reply", async () => {
    const { stream: stdin } = makeFakeStdin();
    const input = stdin as WritableTestStdin;
    const stdoutA = makeFakeWritable();
    const stdoutB = makeFakeWritable();
    const a = mountInputAppOnStreams({ stdin, stdout: stdoutA, kittyMode: "auto" });
    const b = mountInputAppOnStreams({ stdin, stdout: stdoutB, kittyMode: "disabled" });
    try {
      a.app.unmount();
      input.write("\x1b[?1");
      await new Promise<void>((resolve) => setTimeout(resolve, 35));
      input.write("u");
      await flushInput();

      expect(b.inputs).toEqual([]);
    } finally {
      a.app.unmount();
      b.app.unmount();
      stdin.destroy();
      stdoutA.destroy();
      stdoutB.destroy();
    }
  });

  test("a cancelled query tombstone consumes its reply without an application subscriber", async () => {
    const { stream: stdin } = makeFakeStdin();
    const input = stdin as WritableTestStdin;
    const stdoutA = makeFakeWritable();
    const stdoutB = makeFakeWritable();
    const a = mountInputAppOnStreams({ stdin, stdout: stdoutA, kittyMode: "auto" });
    try {
      a.app.unmount();
      expect(stdin.listenerCount("data")).toBe(1);

      input.write("\x1b[?1u");
      await flushInput();
      expect(stdin.listenerCount("data")).toBe(0);

      const b = mountInputAppOnStreams({ stdin, stdout: stdoutB, kittyMode: "disabled" });
      try {
        input.write("x");
        await flushInput();
        expect(b.inputs).toEqual(["x"]);
      } finally {
        b.app.unmount();
      }
    } finally {
      a.app.unmount();
      stdin.destroy();
      stdoutA.destroy();
      stdoutB.destroy();
    }
  });

  test("the last route releases application ownership while its Kitty tombstone remains", async () => {
    const stdin = makeRawByteStdin();
    const input = stdin as WritableTestStdin;
    let refs = 0;
    stdin.ref = () => {
      refs++;
      return stdin;
    };
    stdin.unref = () => {
      refs--;
      return stdin;
    };
    const stdout = makeFakeWritable();
    const writes = captureWrites(stdout);
    const visible = shallowRef(true);
    const inputs: string[] = [];
    const Child = defineComponent(() => {
      useInput(collectInput(inputs));
      return () => null;
    });
    const App = defineComponent(() => () => (visible.value ? h(Child) : null));
    const app = createApp(App);
    app.mount({
      stdout,
      stdin,
      patchConsole: false,
      maxFps: 0,
      kittyKeyboard: { mode: "auto" },
    });
    try {
      expect(stdin.isRaw).toBe(true);
      expect(refs).toBe(1);
      expect(writes).toContain("\x1b[?u");

      visible.value = false;
      await nextTick();
      await flushInput();

      // Only the finite reply tombstone may retain the physical listener. The
      // ended application route no longer owns raw mode, a ref, or delivery.
      expect(stdin.isRaw).toBe(false);
      expect(refs).toBe(0);
      expect(stdin.listenerCount("data")).toBe(1);

      input.write("x");
      input.write("\x1b[?1");
      await new Promise<void>((resolve) => setTimeout(resolve, 35));
      input.write("u");
      await flushInput();

      expect(inputs).toEqual([]);
      expect(stdin.listenerCount("data")).toBe(0);
    } finally {
      app.unmount();
      stdin.destroy();
      stdout.destroy();
    }
  });

  test("an active query does not retain an orphaned paste from a released consumer", async () => {
    const { stream: stdin } = makeFakeStdin();
    const stdout = makeFakeWritable();
    const writes = captureWrites(stdout);
    const visible = shallowRef(true);
    const pastes: string[] = [];
    const Child = defineComponent(() => {
      useInput((event) => {
        if (event.kind === "paste") pastes.push(event.text);
        return "continue";
      });
      return () => h("tui-text", null, "paste");
    });
    const App = defineComponent(
      () => () => (visible.value ? h(Child) : h("tui-text", null, "idle")),
    );
    const app = createApp(App);
    app.mount({
      stdout,
      stdin,
      patchConsole: false,
      liveUpdates: true,
      maxFps: 0,
      kittyKeyboard: { mode: "auto" },
    });
    try {
      stdin.emit("data", "\x1b[200~unfinished");
      visible.value = false;
      await nextTick();
      stdin.emit("data", "\x1b[?1u");
      await flushInput();

      expect(pastes).toEqual([]);
      expect(writes).not.toContain("\x1b[>1u");
      expect(stdin.listenerCount("data")).toBe(0);
    } finally {
      app.unmount();
      stdin.destroy();
      stdout.destroy();
    }
  });

  test("an input-free app starts neither Kitty detection nor application delivery", () => {
    const { stream: stdin } = makeFakeStdin();
    const stdout = makeFakeWritable();
    const writes = captureWrites(stdout);
    const app = createApp(defineComponent(() => () => h("tui-text", null, "idle")));
    app.mount({
      stdout,
      stdin,
      patchConsole: false,
      liveUpdates: true,
      maxFps: 0,
      kittyKeyboard: { mode: "auto" },
    });
    try {
      stdin.emit("data", "\x1b[200~unfinished");
      expect(stdin.listenerCount("data")).toBe(0);
      expect(writes).not.toContain("\x1b[?u");
    } finally {
      app.unmount();
      stdin.destroy();
      stdout.destroy();
    }
  });

  test("a rejected query write does not leave a ghost FIFO slot for the next mount", async () => {
    const { stream: stdin } = makeFakeStdin();
    const stdoutA = makeFakeWritable();
    const stdoutB = makeFakeWritable();
    const writesB = captureWrites(stdoutB);
    const originalWriteA = stdoutA.write.bind(stdoutA);
    stdoutA.write = ((...args: unknown[]) => {
      if (String(args[0]) === "\x1b[?u") throw new Error("query write rejected");
      return (originalWriteA as (...writeArgs: unknown[]) => boolean)(...args);
    }) as NodeJS.WriteStream["write"];
    let selectRoute!: () => () => void;
    const AppA = defineComponent(() => {
      const routing = useInternalInputRoutingForTest();
      const boundary = routing.registerSemantic({
        id: "boundary",
        handle: continueInputRoute,
      });
      selectRoute = () => routing.select({ activeBoundary: boundary.lease });
      return () => h("tui-text", null, "a");
    });
    const appA = createApp(AppA);

    appA.mount({
      stdout: stdoutA,
      stdin,
      patchConsole: false,
      liveUpdates: true,
      maxFps: 0,
      kittyKeyboard: { mode: "auto" },
    });
    expect(selectRoute).toThrow("query write rejected");
    appA.unmount();

    const b = mountInputAppOnStreams({ stdin, stdout: stdoutB, kittyMode: "auto" });
    try {
      stdin.emit("data", "\x1b[?1u");
      await flushInput();

      expect(writesB).toContain("\x1b[>1u");
    } finally {
      b.app.unmount();
      stdin.destroy();
      stdoutA.destroy();
      stdoutB.destroy();
    }
  });

  test("a reentrant enable write cannot overtake the data event that caused it", async () => {
    const stdout = makeFakeWritable();
    const { stream: stdin } = makeFakeStdin();
    const input = stdin as WritableTestStdin;
    const originalWrite = stdout.write.bind(stdout);
    let inject = false;
    stdout.write = ((...args: unknown[]) => {
      const chunk = String(args[0]);
      const result = (originalWrite as (...writeArgs: unknown[]) => boolean)(...args);
      if (inject && chunk === "\x1b[>1u") stdin.emit("data", "x");
      return result;
    }) as NodeJS.WriteStream["write"];

    const { app, inputs } = mountInputAppOnStreams({ stdin, stdout, kittyMode: "auto" });
    try {
      inject = true;
      input.write("a\x1b[?1ub");
      await flushInput();

      expect(inputs).toEqual(["a", "b", "x"]);
    } finally {
      app.unmount();
      stdin.destroy();
      stdout.destroy();
    }
  });

  test("an enable write failure cannot discard ordinary input from the same data event", () => {
    const stdout = makeFakeWritable();
    const { stream: stdin } = makeFakeStdin();
    const originalWrite = stdout.write.bind(stdout);
    let failEnable = false;
    stdout.write = ((...args: unknown[]) => {
      const chunk = String(args[0]);
      if (failEnable && chunk === "\x1b[>1u") throw new Error("enable failed");
      return (originalWrite as (...writeArgs: unknown[]) => boolean)(...args);
    }) as NodeJS.WriteStream["write"];

    const { app, inputs } = mountInputAppOnStreams({ stdin, stdout, kittyMode: "auto" });
    try {
      failEnable = true;
      expect(() => stdin.emit("data", "a\x1b[?1ub")).toThrow("enable failed");
      expect(inputs).toEqual(["a", "b"]);
    } finally {
      app.unmount();
      stdin.destroy();
      stdout.destroy();
    }
  });

  test("two apps sharing stdin observe the same order through reentrant enable writes", async () => {
    const { stream: stdin } = makeFakeStdin();
    const input = stdin as WritableTestStdin;
    const stdoutA = makeFakeWritable();
    const stdoutB = makeFakeWritable();
    const originalWriteA = stdoutA.write.bind(stdoutA);
    const originalWriteB = stdoutB.write.bind(stdoutB);
    let inject = false;
    stdoutA.write = ((...args: unknown[]) => {
      const chunk = String(args[0]);
      const result = (originalWriteA as (...writeArgs: unknown[]) => boolean)(...args);
      if (inject && chunk === "\x1b[>1u") stdin.emit("data", "x");
      return result;
    }) as NodeJS.WriteStream["write"];
    stdoutB.write = ((...args: unknown[]) => {
      const chunk = String(args[0]);
      const result = (originalWriteB as (...writeArgs: unknown[]) => boolean)(...args);
      if (inject && chunk === "\x1b[>1u") stdin.emit("data", "y");
      return result;
    }) as NodeJS.WriteStream["write"];

    const a = mountInputAppOnStreams({ stdin, stdout: stdoutA, kittyMode: "auto" });
    const b = mountInputAppOnStreams({ stdin, stdout: stdoutB, kittyMode: "auto" });
    try {
      inject = true;
      input.write("a\x1b[?1ub\x1b[?1uc");
      await flushInput();

      expect(a.inputs).toEqual(["a", "b", "c", "x", "y"]);
      expect(b.inputs).toEqual(a.inputs);
    } finally {
      a.app.unmount();
      b.app.unmount();
      stdin.destroy();
      stdoutA.destroy();
      stdoutB.destroy();
    }
  });

  test("ordinary input beside an initial synchronous reply is delivered after mount", async () => {
    const stdout = makeFakeWritable();
    const { stream: stdin } = makeFakeStdin();
    const originalWrite = stdout.write.bind(stdout);
    let replied = false;
    stdout.write = ((...args: unknown[]) => {
      const chunk = String(args[0]);
      const result = (originalWrite as (...writeArgs: unknown[]) => boolean)(...args);
      if (!replied && chunk === "\x1b[?u") {
        replied = true;
        stdin.emit("data", "a\x1b[?1ub");
      }
      return result;
    }) as NodeJS.WriteStream["write"];

    const { app, inputs } = mountInputAppOnStreams({ stdin, stdout, kittyMode: "auto" });
    try {
      await flushInput();
      expect(inputs).toEqual(["a", "b"]);
    } finally {
      app.unmount();
      stdin.destroy();
      stdout.destroy();
    }
  });

  test("retained pre-mount input stays ahead of input emitted by its first handler", () => {
    const stdout = makeFakeWritable();
    const { stream: stdin } = makeFakeStdin();
    const inputs: string[] = [];
    const App = defineComponent(() => {
      useInput((event) => {
        const value = inputLabel(event);
        inputs.push(value);
        if (value === "a") stdin.emit("data", "x");
        return "continue";
      });
      return () => h("tui-text", null, "x");
    });
    const originalWrite = stdout.write.bind(stdout);
    let replied = false;
    stdout.write = ((...args: unknown[]) => {
      const chunk = String(args[0]);
      const result = (originalWrite as (...writeArgs: unknown[]) => boolean)(...args);
      if (!replied && chunk === "\x1b[?u") {
        replied = true;
        stdin.emit("data", "a\x1b[?1ub");
      }
      return result;
    }) as NodeJS.WriteStream["write"];

    const app = createApp(App);
    try {
      app.mount({
        stdout,
        stdin,
        patchConsole: false,
        liveUpdates: true,
        maxFps: 0,
        kittyKeyboard: { mode: "auto" },
      });
      expect(inputs).toEqual(["a", "b", "x"]);
    } finally {
      app.unmount();
      stdin.destroy();
      stdout.destroy();
    }
  });

  test("a pre-mount split event binds only the routes present after initial mount", async () => {
    const stdout = makeFakeWritable();
    const { stream: stdin } = makeFakeStdin();
    const showFirst = shallowRef(true);
    const persistent: string[] = [];
    const first: string[] = [];
    const second: string[] = [];
    const First = defineComponent(() => {
      useInput((event) => {
        first.push(namedKeyOrInput(event, "up"));
        return "continue";
      });
      return () => h("tui-text", null, "first");
    });
    const Second = defineComponent(() => {
      useInput((event) => {
        second.push(namedKeyOrInput(event, "up"));
        return "continue";
      });
      return () => h("tui-text", null, "second");
    });
    const App = defineComponent(() => {
      useInput((event) => {
        persistent.push(namedKeyOrInput(event, "up"));
        return "continue";
      });
      return () => h(showFirst.value ? First : Second);
    });
    const originalWrite = stdout.write.bind(stdout);
    let injectedPrefix = false;
    stdout.write = ((...args: unknown[]) => {
      const chunk = String(args[0]);
      const result = (originalWrite as (...writeArgs: unknown[]) => boolean)(...args);
      if (!injectedPrefix && chunk === "\x1b[?u") {
        injectedPrefix = true;
        stdin.emit("data", "\x1b[");
      }
      return result;
    }) as NodeJS.WriteStream["write"];

    const app = createApp(App);
    try {
      app.mount({
        stdout,
        stdin,
        patchConsole: false,
        liveUpdates: true,
        maxFps: 0,
        kittyKeyboard: { mode: "auto" },
      });
      expect(injectedPrefix).toBe(true);

      showFirst.value = false;
      await nextTick();
      stdin.emit("data", "A");
      await flushInput();

      expect({ persistent, first, second }).toEqual({
        persistent: ["up"],
        first: [],
        second: [],
      });

      stdin.emit("data", "x");
      await flushInput();
      expect({ persistent, first, second }).toEqual({
        persistent: ["up", "x"],
        first: [],
        second: ["x"],
      });
    } finally {
      app.unmount();
      stdin.destroy();
      stdout.destroy();
    }
  });

  test("suspending one app does not release shared raw mode while another app still owns it", async () => {
    const { stream: stdin } = makeFakeStdin();
    const input = stdin as WritableTestStdin;
    const rawModeCalls: boolean[] = [];
    input.isRaw = false;
    input.setRawMode = (mode: boolean) => {
      rawModeCalls.push(mode);
      input.isRaw = mode;
      return stdin;
    };
    const stdoutA = makeFakeWritable();
    const stdoutB = makeFakeWritable();
    const suspensionHost = createManualSuspensionHost();
    const a = mountInputAppOnStreams({ stdin, stdout: stdoutA, suspensionHost });
    const b = mountInputAppOnStreams({ stdin, stdout: stdoutB });
    try {
      expect(rawModeCalls).toEqual([true]);
      // The two applications share one framework-owned physical ingress.
      expect(stdin.listenerCount("data")).toBe(1);

      await suspensionHost.suspend();

      expect(stdin.listenerCount("data")).toBe(1);
      expect(input.isRaw).toBe(true);
      expect(rawModeCalls).toEqual([true]);
    } finally {
      a.app.unmount();
      b.app.unmount();
      stdin.destroy();
      stdoutA.destroy();
      stdoutB.destroy();
    }
  });

  test("raw enable re-entry through suspension reconciles before resume", async () => {
    const { stream: stdin } = makeFakeStdin();
    const input = stdin as WritableTestStdin;
    const stdout = makeFakeWritable();
    const suspensionHost = createManualSuspensionHost();
    const rawModeCalls: boolean[] = [];
    let refBalance = 0;
    let suspendOnFirstEnable = true;
    input.isRaw = false;
    input.setRawMode = (mode: boolean) => {
      rawModeCalls.push(mode);
      input.isRaw = mode;
      if (mode && suspendOnFirstEnable) {
        suspendOnFirstEnable = false;
        void suspensionHost.suspend();
      }
      return stdin;
    };
    stdin.ref = () => {
      refBalance++;
      return stdin;
    };
    stdin.unref = () => {
      refBalance--;
      return stdin;
    };
    const app = createApp(InputDummy);
    app.mount({
      stdout,
      stdin,
      patchConsole: false,
      liveUpdates: true,
      maxFps: 0,
      kittyKeyboard: { mode: "disabled" },
      [INTERNAL_SUSPENSION_HOST]: suspensionHost,
    } as Parameters<TuiApp["mount"]>[0]);
    try {
      expect({ rawModeCalls, isRaw: input.isRaw, refBalance }).toEqual({
        rawModeCalls: [true, false],
        isRaw: false,
        refBalance: 0,
      });

      await suspensionHost.resume();
      expect({ rawModeCalls, isRaw: input.isRaw, refBalance }).toEqual({
        rawModeCalls: [true, false, true],
        isRaw: true,
        refBalance: 1,
      });
    } finally {
      app.unmount();
      expect({ rawModeCalls, isRaw: input.isRaw, refBalance }).toEqual({
        rawModeCalls: [true, false, true, false],
        isRaw: false,
        refBalance: 0,
      });
      stdin.destroy();
      stdout.destroy();
    }
  });

  test("raw disable re-entry can transfer ownership to a newly mounted app", () => {
    const { stream: stdin } = makeFakeStdin();
    const input = stdin as WritableTestStdin;
    const stdoutA = makeFakeWritable();
    const stdoutB = makeFakeWritable();
    const rawModeCalls: boolean[] = [];
    let refBalance = 0;
    let mountBOnDisable = false;
    let mountedB = false;
    input.isRaw = false;
    input.setRawMode = (mode: boolean) => {
      rawModeCalls.push(mode);
      input.isRaw = mode;
      if (!mode && mountBOnDisable && !mountedB) {
        mountedB = true;
        appB.mount({
          stdout: stdoutB,
          stdin,
          patchConsole: false,
          liveUpdates: true,
          maxFps: 0,
          kittyKeyboard: { mode: "disabled" },
        });
      }
      return stdin;
    };
    stdin.ref = () => {
      refBalance++;
      return stdin;
    };
    stdin.unref = () => {
      refBalance--;
      return stdin;
    };
    const Root = InputDummy;
    const appA = createApp(Root);
    const appB = createApp(Root);
    appA.mount({
      stdout: stdoutA,
      stdin,
      patchConsole: false,
      liveUpdates: true,
      maxFps: 0,
      kittyKeyboard: { mode: "disabled" },
    });
    try {
      mountBOnDisable = true;
      appA.unmount();

      expect({ rawModeCalls, isRaw: input.isRaw, refBalance, mountedB }).toEqual({
        rawModeCalls: [true, false, true],
        isRaw: true,
        refBalance: 1,
        mountedB: true,
      });
    } finally {
      appB.unmount();
      expect({ rawModeCalls, isRaw: input.isRaw, refBalance }).toEqual({
        rawModeCalls: [true, false, true, false],
        isRaw: false,
        refBalance: 0,
      });
      stdin.destroy();
      stdoutA.destroy();
      stdoutB.destroy();
    }
  });

  test("an unref failure still converges every raw-mode invariant for a re-entrant owner", () => {
    const { stream: stdin } = makeFakeStdin();
    const input = stdin as WritableTestStdin;
    const stdoutA = makeFakeWritable();
    const stdoutB = makeFakeWritable();
    const rawModeCalls: boolean[] = [];
    let refBalance = 0;
    let mountBAndFailUnref = false;
    let mountedB = false;
    input.isRaw = false;
    input.setRawMode = (mode: boolean) => {
      rawModeCalls.push(mode);
      input.isRaw = mode;
      return stdin;
    };
    stdin.ref = () => {
      refBalance++;
      return stdin;
    };
    stdin.unref = () => {
      refBalance--;
      if (mountBAndFailUnref) {
        mountBAndFailUnref = false;
        mountedB = true;
        appB.mount({
          stdout: stdoutB,
          stdin,
          patchConsole: false,
          liveUpdates: true,
          maxFps: 0,
          kittyKeyboard: { mode: "disabled" },
        });
        throw new Error("unref failed after taking effect");
      }
      return stdin;
    };
    const Root = InputDummy;
    const appA = createApp(Root);
    const appB = createApp(Root);
    appA.mount({
      stdout: stdoutA,
      stdin,
      patchConsole: false,
      liveUpdates: true,
      maxFps: 0,
      kittyKeyboard: { mode: "disabled" },
    });
    try {
      mountBAndFailUnref = true;
      expect(() => appA.unmount()).not.toThrow();

      expect({ rawModeCalls, isRaw: input.isRaw, refBalance, mountedB }).toEqual({
        rawModeCalls: [true, false, true],
        isRaw: true,
        refBalance: 1,
        mountedB: true,
      });
    } finally {
      appB.unmount();
      expect({ rawModeCalls, isRaw: input.isRaw, refBalance }).toEqual({
        rawModeCalls: [true, false, true, false],
        isRaw: false,
        refBalance: 0,
      });
      stdin.destroy();
      stdoutA.destroy();
      stdoutB.destroy();
    }
  });

  interface TerminalModeCase {
    readonly label: string;
    readonly enable: string;
    readonly disable: string;
    readonly capturesDisableError: boolean;
    readonly mode: "inline" | "fullscreen";
    readonly install: (
      active: ShallowRef<boolean>,
      target: ShallowRef<ComponentPublicInstance | null>,
    ) => void;
  }

  const bracketedPasteModeCase: TerminalModeCase = {
    label: "bracketed paste",
    enable: "\x1b[?2004h",
    disable: "\x1b[?2004l",
    capturesDisableError: false,
    mode: "inline",
    install: (active: ShallowRef<boolean>) => {
      useInput(observeInput, { isActive: active });
    },
  };
  const sgrMouseModeCase: TerminalModeCase = {
    label: "SGR mouse",
    enable: "\x1b[?1000h\x1b[?1006h",
    disable: "\x1b[?1000l\x1b[?1006l",
    capturesDisableError: true,
    mode: "fullscreen",
    install: (active, target) => {
      useMouseEvent(target, "wheel", () => "continue", { isActive: active });
    },
  };
  const terminalModeCases: readonly TerminalModeCase[] = [bracketedPasteModeCase, sgrMouseModeCase];
  const enableTerminalModeCases: readonly TerminalModeCase[] = [bracketedPasteModeCase];
  const suspensionModeCases: readonly TerminalModeCase[] = [
    bracketedPasteModeCase,
    sgrMouseModeCase,
  ];

  interface TargetedMouseLifecycleContext {
    readonly active: ShallowRef<boolean>;
    readonly visible: ShallowRef<boolean>;
    readonly writes: readonly string[];
    readonly input: WritableTestStdin;
    readonly stdin: NodeJS.ReadStream;
    readonly refBalance: () => number;
  }

  const targetedMouseLifecycleCases: readonly {
    readonly label: string;
    readonly run: (context: TargetedMouseLifecycleContext) => Promise<void>;
  }[] = [
    {
      label: "targeted SGR mouse demand follows accepted activation and deactivation",
      async run({ active, writes, input, stdin, refBalance }) {
        expect(writes.join("")).not.toContain(sgrMouseModeCase.enable);
        expect({ isRaw: input.isRaw, refBalance: refBalance() }).toEqual({
          isRaw: false,
          refBalance: 0,
        });

        active.value = true;
        await waitForWriteCount(writes, sgrMouseModeCase.enable, 1);
        expect({
          isRaw: input.isRaw,
          refBalance: refBalance(),
          data: stdin.listenerCount("data"),
        }).toEqual({ isRaw: true, refBalance: 1, data: 1 });

        active.value = false;
        await waitForWriteCount(writes, sgrMouseModeCase.disable, 1);
        expect({
          isRaw: input.isRaw,
          refBalance: refBalance(),
          data: stdin.listenerCount("data"),
        }).toEqual({ isRaw: false, refBalance: 0, data: 0 });
      },
    },
    {
      label: "targeted SGR mouse demand reacquires after an accepted deactivation",
      async run({ active, writes, input, stdin, refBalance }) {
        active.value = true;
        await waitForWriteCount(writes, sgrMouseModeCase.enable, 1);
        active.value = false;
        await waitForWriteCount(writes, sgrMouseModeCase.disable, 1);
        active.value = true;
        await waitForWriteCount(writes, sgrMouseModeCase.enable, 2);

        expect(
          writes.filter(
            (value) => value === sgrMouseModeCase.enable || value === sgrMouseModeCase.disable,
          ),
        ).toEqual([sgrMouseModeCase.enable, sgrMouseModeCase.disable, sgrMouseModeCase.enable]);
        expect({
          isRaw: input.isRaw,
          refBalance: refBalance(),
          data: stdin.listenerCount("data"),
        }).toEqual({ isRaw: true, refBalance: 1, data: 1 });
      },
    },
    {
      label: "targeted SGR mouse demand releases and reacquires with its visible target",
      async run({ active, visible, writes, input, stdin, refBalance }) {
        active.value = true;
        await waitForWriteCount(writes, sgrMouseModeCase.enable, 1);

        visible.value = false;
        await waitForWriteCount(writes, sgrMouseModeCase.disable, 1);
        expect({
          isRaw: input.isRaw,
          refBalance: refBalance(),
          data: stdin.listenerCount("data"),
        }).toEqual({ isRaw: false, refBalance: 0, data: 0 });

        visible.value = true;
        await waitForWriteCount(writes, sgrMouseModeCase.enable, 2);
        expect({
          isRaw: input.isRaw,
          refBalance: refBalance(),
          data: stdin.listenerCount("data"),
        }).toEqual({ isRaw: true, refBalance: 1, data: 1 });
      },
    },
  ];

  test.each(enableTerminalModeCases)(
    "$label enable restores the terminal when stdout throws after the write",
    async ({ enable, disable, install, mode }) => {
      const previousTerm = process.env["TERM"];
      process.env["TERM"] = "xterm-256color";
      const { stream: stdin } = makeFakeStdin();
      const input = stdin as WritableTestStdin;
      const stdout = makeFakeWritable();
      const writes = captureWrites(stdout);
      const active = shallowRef(false);
      const errors: unknown[] = [];
      let refBalance = 0;
      let failEnable = false;
      input.isRaw = false;
      input.setRawMode = (mode: boolean) => {
        input.isRaw = mode;
        return stdin;
      };
      stdin.ref = () => {
        refBalance++;
        return stdin;
      };
      stdin.unref = () => {
        refBalance--;
        return stdin;
      };
      const originalWrite = stdout.write.bind(stdout);
      stdout.write = ((...args: unknown[]) => {
        const value = String(args[0]);
        const result = (originalWrite as (...writeArgs: unknown[]) => boolean)(...args);
        if (failEnable && value === enable) {
          failEnable = false;
          throw new Error("enable failed after write");
        }
        return result;
      }) as NodeJS.WriteStream["write"];
      const Child = defineComponent(() => {
        const target = shallowRef<ComponentPublicInstance | null>(null);
        install(active, target);
        return () => h(Text, { ref: target }, () => "x");
      });
      const App = defineComponent(() => {
        onErrorCaptured((error) => {
          errors.push(error);
          return false;
        });
        return () => h(Child);
      });
      const app = createApp(App);
      try {
        app.mount({
          stdout,
          stdin,
          patchConsole: false,
          liveUpdates: true,
          maxFps: 0,
          mode,
          kittyKeyboard: { mode: "disabled" },
        });
        await waitForWrite(writes, "x");
        failEnable = true;
        active.value = true;
        await flushRenderedTarget();

        expect(errors).toHaveLength(1);
        expect(writes.filter((value) => value === enable || value === disable)).toEqual([
          enable,
          disable,
        ]);
        expect({
          isRaw: input.isRaw,
          refBalance,
          dataListeners: stdin.listenerCount("data"),
        }).toEqual({ isRaw: false, refBalance: 0, dataListeners: 0 });
      } finally {
        app.unmount();
        if (previousTerm === undefined) delete process.env["TERM"];
        else process.env["TERM"] = previousTerm;
        stdin.destroy();
        stdout.destroy();
      }
    },
  );

  test.each(terminalModeCases)(
    "$label disable releases raw input even when stdout throws after the write",
    async ({ enable, disable, capturesDisableError, install, mode }) => {
      const previousTerm = process.env["TERM"];
      process.env["TERM"] = "xterm-256color";
      const { stream: stdin } = makeFakeStdin();
      const input = stdin as WritableTestStdin;
      const stdout = makeFakeWritable();
      const writes = captureWrites(stdout);
      const active = shallowRef(false);
      const errors: unknown[] = [];
      let refBalance = 0;
      let failDisable = false;
      input.isRaw = false;
      input.setRawMode = (mode: boolean) => {
        input.isRaw = mode;
        return stdin;
      };
      stdin.ref = () => {
        refBalance++;
        return stdin;
      };
      stdin.unref = () => {
        refBalance--;
        return stdin;
      };
      const originalWrite = stdout.write.bind(stdout);
      stdout.write = ((...args: unknown[]) => {
        const value = String(args[0]);
        const result = (originalWrite as (...writeArgs: unknown[]) => boolean)(...args);
        if (failDisable && value === disable) {
          failDisable = false;
          throw new Error("disable failed after write");
        }
        return result;
      }) as NodeJS.WriteStream["write"];
      const Child = defineComponent(() => {
        const target = shallowRef<ComponentPublicInstance | null>(null);
        install(active, target);
        return () => h(Text, { ref: target }, () => "x");
      });
      const App = defineComponent(() => {
        onErrorCaptured((error) => {
          errors.push(error);
          return false;
        });
        return () => h(Child);
      });
      const app = createApp(App);
      try {
        app.mount({
          stdout,
          stdin,
          patchConsole: false,
          liveUpdates: true,
          maxFps: 0,
          mode,
          kittyKeyboard: { mode: "disabled" },
        });
        await waitForWrite(writes, "x");
        active.value = true;
        await waitForWrite(writes, enable);
        failDisable = true;
        active.value = false;
        await flushRenderedTarget();

        expect(errors).toHaveLength(capturesDisableError ? 1 : 0);
        expect(writes.filter((value) => value === enable || value === disable)).toEqual([
          enable,
          disable,
          disable,
        ]);
        expect({
          isRaw: input.isRaw,
          refBalance,
          dataListeners: stdin.listenerCount("data"),
        }).toEqual({ isRaw: false, refBalance: 0, dataListeners: 0 });
      } finally {
        app.unmount();
        if (previousTerm === undefined) delete process.env["TERM"];
        else process.env["TERM"] = previousTerm;
        stdin.destroy();
        stdout.destroy();
      }
    },
  );

  test.each(terminalModeCases)(
    "$label reconciles a re-entrant final active state before surfacing a disable error",
    async ({ enable, disable, capturesDisableError, install, mode }) => {
      const previousTerm = process.env["TERM"];
      process.env["TERM"] = "xterm-256color";
      const { stream: stdin } = makeFakeStdin();
      const input = stdin as WritableTestStdin;
      const stdout = makeFakeWritable();
      const writes = captureWrites(stdout);
      const active = shallowRef(false);
      const errors: unknown[] = [];
      let refBalance = 0;
      let reactivateAndFail = false;
      input.isRaw = false;
      input.setRawMode = (mode: boolean) => {
        input.isRaw = mode;
        return stdin;
      };
      stdin.ref = () => {
        refBalance++;
        return stdin;
      };
      stdin.unref = () => {
        refBalance--;
        return stdin;
      };
      const originalWrite = stdout.write.bind(stdout);
      stdout.write = ((...args: unknown[]) => {
        const value = String(args[0]);
        const result = (originalWrite as (...writeArgs: unknown[]) => boolean)(...args);
        if (reactivateAndFail && value === disable) {
          reactivateAndFail = false;
          active.value = true;
          throw new Error("disable failed after reactivation");
        }
        return result;
      }) as NodeJS.WriteStream["write"];
      const Child = defineComponent(() => {
        const target = shallowRef<ComponentPublicInstance | null>(null);
        install(active, target);
        return () => h(Text, { ref: target }, () => "x");
      });
      const App = defineComponent(() => {
        onErrorCaptured((error) => {
          errors.push(error);
          return false;
        });
        return () => h(Child);
      });
      const app = createApp(App);
      try {
        app.mount({
          stdout,
          stdin,
          patchConsole: false,
          liveUpdates: true,
          maxFps: 0,
          mode,
          kittyKeyboard: { mode: "disabled" },
        });
        await waitForWrite(writes, "x");
        active.value = true;
        await waitForWrite(writes, enable);
        reactivateAndFail = true;
        active.value = false;
        await flushRenderedTarget();

        expect(errors).toHaveLength(capturesDisableError ? 1 : 0);
        expect(active.value).toBe(true);
        expect(writes.filter((value) => value === enable || value === disable)).toEqual([
          enable,
          disable,
          disable,
          enable,
        ]);
        expect({
          isRaw: input.isRaw,
          refBalance,
          dataListeners: stdin.listenerCount("data"),
        }).toEqual({ isRaw: true, refBalance: 1, dataListeners: 1 });
      } finally {
        app.unmount();
        if (previousTerm === undefined) delete process.env["TERM"];
        else process.env["TERM"] = previousTerm;
        stdin.destroy();
        stdout.destroy();
      }
    },
  );

  test.each(targetedMouseLifecycleCases)("$label", async ({ run }) => {
    const previousTerm = process.env["TERM"];
    process.env["TERM"] = "xterm-256color";
    const { stream: stdin } = makeFakeStdin();
    const input = stdin as WritableTestStdin;
    const stdout = makeFakeWritable();
    const writes = captureWrites(stdout);
    const active = shallowRef(false);
    const visible = shallowRef(true);
    let refBalance = 0;
    input.isRaw = false;
    input.setRawMode = (mode: boolean) => {
      input.isRaw = mode;
      return stdin;
    };
    stdin.ref = () => {
      refBalance++;
      return stdin;
    };
    stdin.unref = () => {
      refBalance--;
      return stdin;
    };
    const Target = defineComponent(() => {
      const target = shallowRef<ComponentPublicInstance | null>(null);
      useMouseEvent(target, "wheel", () => "continue", { isActive: active });
      return () => h(Text, { ref: target }, () => "target");
    });
    const App = defineComponent(
      () => () => (visible.value ? h(Target) : h(Text, null, () => "idle")),
    );
    const app = createApp(App);
    try {
      app.mount({
        stdout,
        stdin,
        patchConsole: false,
        liveUpdates: true,
        maxFps: 0,
        mode: "fullscreen",
        kittyKeyboard: { mode: "disabled" },
      });
      await waitForWrite(writes, "target");
      await run({
        active,
        visible,
        writes,
        input,
        stdin,
        refBalance: () => refBalance,
      });
    } finally {
      app.unmount();
      if (previousTerm === undefined) delete process.env["TERM"];
      else process.env["TERM"] = previousTerm;
      stdin.destroy();
      stdout.destroy();
    }
  });

  test.each([
    {
      label: "useInput",
      install: (active: ShallowRef<boolean>) => {
        useInput(observeInput, { isActive: active });
      },
    },
  ])("$label reconciles re-entrant activation after a raw-mode error", async ({ install }) => {
    const { stream: stdin } = makeFakeStdin();
    const input = stdin as WritableTestStdin;
    const stdout = makeFakeWritable();
    const active = shallowRef(false);
    const errors: unknown[] = [];
    const rawModeCalls: boolean[] = [];
    let refBalance = 0;
    let toggleAndFail = false;
    input.isRaw = false;
    input.setRawMode = (mode: boolean) => {
      rawModeCalls.push(mode);
      input.isRaw = mode;
      if (mode && toggleAndFail) {
        toggleAndFail = false;
        active.value = false;
        active.value = true;
        throw new Error("raw enable failed after reactivation");
      }
      return stdin;
    };
    stdin.ref = () => {
      refBalance++;
      return stdin;
    };
    stdin.unref = () => {
      refBalance--;
      return stdin;
    };
    const Child = defineComponent(() => {
      install(active);
      return () => h("tui-text", null, "x");
    });
    const App = defineComponent(() => {
      onErrorCaptured((error) => {
        errors.push(error);
        return false;
      });
      return () => h(Child);
    });
    const app = createApp(App);
    try {
      app.mount({
        stdout,
        stdin,
        patchConsole: false,
        liveUpdates: true,
        maxFps: 0,
        kittyKeyboard: { mode: "disabled" },
      });
      toggleAndFail = true;
      active.value = true;
      await nextTick();
      await flushInput();

      expect(errors).toHaveLength(1);
      expect(active.value).toBe(true);
      expect({ rawModeCalls, isRaw: input.isRaw, refBalance }).toEqual({
        rawModeCalls: [true, false, true],
        isRaw: true,
        refBalance: 1,
      });
      expect(stdin.listenerCount("data")).toBe(1);
    } finally {
      app.unmount();
      stdin.destroy();
      stdout.destroy();
    }
  });

  test.each(suspensionModeCases)(
    "$label suspension retries a one-shot restore failure before returning",
    async ({ enable, disable, install, mode }) => {
      const previousTerm = process.env["TERM"];
      process.env["TERM"] = "xterm-256color";
      const { stream: stdin } = makeFakeStdin();
      const input = stdin as WritableTestStdin;
      const stdout = makeFakeWritable();
      const active = shallowRef(false);
      const suspensionHost = createManualSuspensionHost();
      const writes = captureWrites(stdout);
      let refBalance = 0;
      let failDisable = false;
      let disableAttempts = 0;
      input.isRaw = false;
      input.setRawMode = (mode: boolean) => {
        input.isRaw = mode;
        return stdin;
      };
      stdin.ref = () => {
        refBalance++;
        return stdin;
      };
      stdin.unref = () => {
        refBalance--;
        return stdin;
      };
      const originalWrite = stdout.write.bind(stdout);
      stdout.write = ((...args: unknown[]) => {
        const value = String(args[0]);
        if (value === disable) {
          disableAttempts++;
          if (failDisable) {
            failDisable = false;
            throw new Error("disable failed before write");
          }
        }
        return (originalWrite as (...writeArgs: unknown[]) => boolean)(...args);
      }) as NodeJS.WriteStream["write"];
      const App = defineComponent(() => {
        const target = shallowRef<ComponentPublicInstance | null>(null);
        install(active, target);
        return () => h(Text, { ref: target }, () => "x");
      });
      const app = createApp(App);
      try {
        app.mount({
          stdout,
          stdin,
          patchConsole: false,
          liveUpdates: true,
          maxFps: 0,
          mode,
          kittyKeyboard: { mode: "disabled" },
          [INTERNAL_SUSPENSION_HOST]: suspensionHost,
        } as Parameters<TuiApp["mount"]>[0]);
        await waitForWrite(writes, "x");
        active.value = true;
        await waitForWrite(writes, enable);
        failDisable = true;
        await suspensionHost.suspend();

        expect(disableAttempts).toBe(2);
        expect({
          isRaw: input.isRaw,
          refBalance,
          dataListeners: stdin.listenerCount("data"),
        }).toEqual({ isRaw: false, refBalance: 0, dataListeners: 0 });
      } finally {
        app.unmount();
        if (previousTerm === undefined) delete process.env["TERM"];
        else process.env["TERM"] = previousTerm;
        stdin.destroy();
        stdout.destroy();
      }
    },
  );

  test("suspension and unmount retry one-shot raw-mode restore failures", async () => {
    const { stream: stdin } = makeFakeStdin();
    const input = stdin as WritableTestStdin;
    const stdout = makeFakeWritable();
    const suspensionHost = createManualSuspensionHost();
    let failDisable = false;
    let disableAttempts = 0;
    input.isRaw = false;
    input.setRawMode = (mode: boolean) => {
      if (!mode) {
        disableAttempts++;
        if (failDisable) {
          failDisable = false;
          throw new Error("raw disable failed before taking effect");
        }
      }
      input.isRaw = mode;
      return stdin;
    };
    const app = createApp(InputDummy);
    app.mount({
      stdout,
      stdin,
      patchConsole: false,
      liveUpdates: true,
      maxFps: 0,
      kittyKeyboard: { mode: "disabled" },
      [INTERNAL_SUSPENSION_HOST]: suspensionHost,
    } as Parameters<TuiApp["mount"]>[0]);
    try {
      failDisable = true;
      await suspensionHost.suspend();
      expect({ disableAttempts, isRaw: input.isRaw }).toEqual({
        disableAttempts: 2,
        isRaw: false,
      });

      await suspensionHost.resume();
      expect(input.isRaw).toBe(true);
      failDisable = true;
      app.unmount();
      expect({ disableAttempts, isRaw: input.isRaw }).toEqual({
        disableAttempts: 4,
        isRaw: false,
      });
    } finally {
      app.unmount();
      stdin.destroy();
      stdout.destroy();
    }
  });

  test("unmount retries a one-shot stdin.unref failure", () => {
    const { stream: stdin } = makeFakeStdin();
    const input = stdin as WritableTestStdin;
    const stdout = makeFakeWritable();
    let refBalance = 0;
    let failUnref = true;
    let unrefAttempts = 0;
    input.isRaw = false;
    input.setRawMode = (mode: boolean) => {
      input.isRaw = mode;
      return stdin;
    };
    stdin.ref = () => {
      refBalance++;
      return stdin;
    };
    stdin.unref = () => {
      unrefAttempts++;
      if (failUnref) {
        failUnref = false;
        throw new Error("unref failed before taking effect");
      }
      refBalance--;
      return stdin;
    };
    const app = createApp(InputDummy);
    app.mount({
      stdout,
      stdin,
      patchConsole: false,
      liveUpdates: true,
      maxFps: 0,
      kittyKeyboard: { mode: "disabled" },
    });

    expect(() => app.unmount()).not.toThrow();
    expect({ isRaw: input.isRaw, refBalance, unrefAttempts }).toEqual({
      isRaw: false,
      refBalance: 0,
      unrefAttempts: 2,
    });
    stdin.destroy();
    stdout.destroy();
  });

  test("listener detach failure cannot skip paste, mouse, or raw cleanup", async () => {
    const previousTerm = process.env["TERM"];
    process.env["TERM"] = "xterm-256color";
    const { stream: stdin } = makeFakeStdin();
    const input = stdin as WritableTestStdin;
    const stdout = makeFakeWritable();
    const writes = captureWrites(stdout);
    const mouseActive = shallowRef(false);
    let refBalance = 0;
    input.isRaw = false;
    input.setRawMode = (mode: boolean) => {
      input.isRaw = mode;
      return stdin;
    };
    stdin.ref = () => {
      refBalance++;
      return stdin;
    };
    stdin.unref = () => {
      refBalance--;
      return stdin;
    };
    const App = defineComponent(() => {
      const target = shallowRef<ComponentPublicInstance | null>(null);
      useInput(observeInput);
      useMouseEvent(target, "wheel", () => "continue", { isActive: mouseActive });
      return () => h(Text, { ref: target }, () => "x");
    });
    const app = createApp(App);
    const originalOff = stdin.off.bind(stdin) as typeof stdin.off;
    let failedDataOffCalls = 0;
    stdin.off = ((event: string | symbol, listener: (...args: any[]) => void) => {
      if (event === "data" && failedDataOffCalls++ < 2) {
        throw new Error("data off failed");
      }
      return originalOff(event, listener);
    }) as typeof stdin.off;
    try {
      app.mount({
        stdout,
        stdin,
        patchConsole: false,
        liveUpdates: true,
        maxFps: 0,
        mode: "fullscreen",
        kittyKeyboard: { mode: "disabled" },
      });
      await waitForWrite(writes, "x");
      mouseActive.value = true;
      await waitForWrite(writes, "\x1b[?1000h\x1b[?1006h");

      expect(() => app.unmount()).not.toThrow();
      expect({ isRaw: input.isRaw, refBalance }).toEqual({ isRaw: false, refBalance: 0 });
      expect(writes.join("")).toContain("\x1b[?2004l");
      expect(writes.join("")).toContain("\x1b[?1000l\x1b[?1006l");
    } finally {
      stdin.off = originalOff;
      for (const listener of stdin.listeners("data")) {
        stdin.off("data", listener as (...args: any[]) => void);
      }
      if (previousTerm === undefined) delete process.env["TERM"];
      else process.env["TERM"] = previousTerm;
      stdin.destroy();
      stdout.destroy();
    }
  });

  test("detach re-entry preserves the replacement app listener without backdating its route", async () => {
    const { stream: stdin } = makeFakeStdin();
    const stdoutA = makeFakeWritable();
    const stdoutB = makeFakeWritable();
    const activeB = shallowRef(false);
    const inputsB: string[] = [];
    const AppA = defineComponent(() => {
      useInput(observeInput);
      return () => h("tui-text", null, "a");
    });
    const AppB = defineComponent(() => {
      useInput(collectInput(inputsB), { isActive: activeB });
      return () => h("tui-text", null, "b");
    });
    const appA = createApp(AppA);
    const appB = createApp(AppB);
    appA.mount({
      stdout: stdoutA,
      stdin,
      patchConsole: false,
      liveUpdates: true,
      maxFps: 0,
      kittyKeyboard: { mode: "disabled" },
    });
    appB.mount({
      stdout: stdoutB,
      stdin,
      patchConsole: false,
      liveUpdates: true,
      maxFps: 0,
      kittyKeyboard: { mode: "disabled" },
    });

    const originalOn = stdin.on.bind(stdin) as typeof stdin.on;
    const originalOff = stdin.off.bind(stdin) as typeof stdin.off;
    let injectPartialOnAttach = false;
    let reentered = false;
    stdin.on = ((event: string | symbol, listener: (...args: any[]) => void) => {
      const result = originalOn(event as string, listener);
      if (event === "data" && injectPartialOnAttach) {
        injectPartialOnAttach = false;
        listener("\x1b[");
      }
      return result;
    }) as typeof stdin.on;
    stdin.off = ((event: string | symbol, listener: (...args: any[]) => void) => {
      if (event === "data" && !reentered) {
        reentered = true;
        injectPartialOnAttach = true;
        activeB.value = true;
        originalOff(event as string, listener);
        throw new Error("off failed after remove");
      }
      return originalOff(event as string, listener);
    }) as typeof stdin.off;

    try {
      expect(() => appA.unmount()).not.toThrow();
      expect(stdin.listenerCount("data")).toBe(1);
      stdin.emit("data", "A");
      await flushInput();

      // The host emitted the partial CSI while acquireRawMode was attaching the
      // app subscription, before useInput committed its route lease. Framing is
      // preserved, but the later lease cannot inherit that already-started key.
      expect(inputsB).toEqual([]);

      stdin.emit("data", "x");
      await flushInput();
      expect(inputsB).toEqual(["x"]);
    } finally {
      stdin.on = originalOn;
      stdin.off = originalOff;
      appB.unmount();
      stdin.destroy();
      stdoutA.destroy();
      stdoutB.destroy();
    }
  });

  test("pause re-entry leaves a newly active replacement app flowing", async () => {
    const stdin = makeRawByteStdin();
    const stdoutA = makeFakeWritable();
    const stdoutB = makeFakeWritable();
    const activeB = shallowRef(false);
    const inputsB: string[] = [];
    const AppA = defineComponent(() => {
      useInput(observeInput);
      return () => h("tui-text", null, "a");
    });
    const AppB = defineComponent(() => {
      useInput(collectInput(inputsB), { isActive: activeB });
      return () => h("tui-text", null, "b");
    });
    const appA = createApp(AppA);
    const appB = createApp(AppB);
    appA.mount({
      stdout: stdoutA,
      stdin,
      patchConsole: false,
      liveUpdates: true,
      maxFps: 0,
      kittyKeyboard: { mode: "disabled" },
    });
    appB.mount({
      stdout: stdoutB,
      stdin,
      patchConsole: false,
      liveUpdates: true,
      maxFps: 0,
      kittyKeyboard: { mode: "disabled" },
    });
    const originalPause = stdin.pause.bind(stdin);
    let reentered = false;
    stdin.pause = (() => {
      if (!reentered) {
        reentered = true;
        activeB.value = true;
      }
      return originalPause();
    }) as typeof stdin.pause;
    try {
      appA.unmount();

      expect(stdin.listenerCount("data")).toBe(1);
      expect(stdin.readableFlowing).toBe(true);
      stdin.write("z");
      await flushInput();
      expect(inputsB).toEqual(["z"]);
    } finally {
      stdin.pause = originalPause;
      appB.unmount();
      stdin.destroy();
      stdoutA.destroy();
      stdoutB.destroy();
    }
  });

  test("suspension cannot retain ordinary input emitted while a Kitty query is pending", async () => {
    const { stream: stdin } = makeFakeStdin();
    const input = stdin as WritableTestStdin;
    input.isRaw = false;
    input.setRawMode = (mode: boolean) => {
      input.isRaw = mode;
      if (!mode) stdin.emit("data", "x");
      return stdin;
    };
    const stdout = makeFakeWritable();
    const suspensionHost = createManualSuspensionHost();
    const { app, inputs } = mountInputAppOnStreams({
      stdin,
      stdout,
      kittyMode: "auto",
      suspensionHost,
    });
    try {
      await suspensionHost.suspend();
      await suspensionHost.resume();
      await flushInput();

      expect(inputs).toEqual([]);
    } finally {
      app.unmount();
      stdin.destroy();
      stdout.destroy();
    }
  });

  test("continuation restores mouse classification before synchronous buffered input", async () => {
    const previousTerm = process.env["TERM"];
    process.env["TERM"] = "xterm-256color";
    const { stream: stdin } = makeFakeStdin();
    const stdout = makeFakeWritable();
    const writes = captureWrites(stdout);
    const mouseActive = shallowRef(false);
    const suspensionHost = createManualSuspensionHost();
    const inputs: string[] = [];
    const mice: unknown[] = [];
    const App = defineComponent(() => {
      const target = shallowRef<ComponentPublicInstance | null>(null);
      useInput(collectInput(inputs));
      useMouseEvent(
        target,
        "wheel",
        (event) => {
          mice.push(event);
          return "continue";
        },
        { isActive: mouseActive },
      );
      return () => h(Text, { ref: target }, () => "x");
    });
    const originalResume = stdin.resume.bind(stdin);
    let emitMouseOnResume = false;
    stdin.resume = (() => {
      const result = originalResume();
      if (emitMouseOnResume) {
        emitMouseOnResume = false;
        stdin.emit("data", "\x1b[<64;1;1M");
      }
      return result;
    }) as typeof stdin.resume;
    const app = createApp(App);
    app.mount({
      stdout,
      stdin,
      patchConsole: false,
      liveUpdates: true,
      maxFps: 0,
      mode: "fullscreen",
      kittyKeyboard: { mode: "disabled" },
      [INTERNAL_SUSPENSION_HOST]: suspensionHost,
    } as Parameters<TuiApp["mount"]>[0]);
    try {
      await waitForWrite(writes, "x");
      mouseActive.value = true;
      await waitForWrite(writes, "\x1b[?1000h\x1b[?1006h");
      await suspensionHost.suspend();
      emitMouseOnResume = true;
      await suspensionHost.resume();
      await flushInput();

      expect(inputs).toEqual([]);
      expect(mice).toHaveLength(1);
    } finally {
      app.unmount();
      if (previousTerm === undefined) delete process.env["TERM"];
      else process.env["TERM"] = previousTerm;
      stdin.destroy();
      stdout.destroy();
    }
  });

  test.each([
    ["CSI", "\x1b["],
    ["bracketed paste", "\x1b[200~unfinished"],
    ["UTF-8 scalar", new Uint8Array([0xf0, 0x9f])],
  ] as const)(
    "the last consumer release discards an orphaned partial %s",
    async (_name, partial) => {
      const { stream: stdin } = makeFakeStdin();
      const stdout = makeFakeWritable();
      const visible = shallowRef(true);
      const Child = defineComponent(() => {
        useInput(observeInput);
        return () => h("tui-text", null, "input");
      });
      const App = defineComponent(
        () => () => (visible.value ? h(Child) : h("tui-text", null, "idle")),
      );
      const app = createApp(App);
      app.mount({
        stdout,
        stdin,
        patchConsole: false,
        liveUpdates: true,
        maxFps: 0,
        kittyKeyboard: { mode: "disabled" },
      });
      try {
        stdin.emit("data", partial);
        expect(stdin.listenerCount("data")).toBe(1);

        visible.value = false;
        await nextTick();

        expect(stdin.listenerCount("data")).toBe(0);
      } finally {
        app.unmount();
        stdin.destroy();
        stdout.destroy();
      }
    },
  );

  test("a partial event stays framed for another recipient that saw its start", async () => {
    const { stream: stdin } = makeFakeStdin();
    const stdoutA = makeFakeWritable();
    const stdoutB = makeFakeWritable();
    const visibleA = shallowRef(true);
    const inputsA: string[] = [];
    const ChildA = defineComponent(() => {
      useInput(collectInput(inputsA));
      return () => h("tui-text", null, "a");
    });
    const AppA = defineComponent(
      () => () => (visibleA.value ? h(ChildA) : h("tui-text", null, "idle")),
    );
    const appA = createApp(AppA);
    appA.mount({
      stdout: stdoutA,
      stdin,
      patchConsole: false,
      liveUpdates: true,
      maxFps: 0,
      kittyKeyboard: { mode: "disabled" },
    });
    const b = mountInputAppOnStreams({ stdin, stdout: stdoutB, kittyMode: "disabled" });
    try {
      stdin.emit("data", "\x1b[");
      visibleA.value = false;
      await nextTick();

      expect(stdin.listenerCount("data")).toBe(1);
      stdin.emit("data", "A");
      await flushInput();

      expect(inputsA).toEqual([]);
      expect(b.inputs).toEqual([""]);
    } finally {
      appA.unmount();
      b.app.unmount();
      stdin.destroy();
      stdoutA.destroy();
      stdoutB.destroy();
    }
  });

  test("split CSI keeps independent route snapshots across two apps", async () => {
    const { stream: stdin } = makeFakeStdin();
    const stdoutA = makeFakeWritable();
    const stdoutB = makeFakeWritable();
    const showFirst = shallowRef(true);
    const persistentA: string[] = [];
    const first: string[] = [];
    const second: string[] = [];
    const persistentB: string[] = [];
    const First = defineComponent(() => {
      useInput((event) => {
        first.push(namedKeyOrInput(event, "up"));
        return "continue";
      });
      return () => h("tui-text", null, "first");
    });
    const Second = defineComponent(() => {
      useInput((event) => {
        second.push(namedKeyOrInput(event, "up"));
        return "continue";
      });
      return () => h("tui-text", null, "second");
    });
    const AppA = defineComponent(() => {
      useInput((event) => {
        persistentA.push(namedKeyOrInput(event, "up"));
        return "continue";
      });
      return () => h(showFirst.value ? First : Second);
    });
    const AppB = defineComponent(() => {
      useInput((event) => {
        persistentB.push(namedKeyOrInput(event, "up"));
        return "continue";
      });
      return () => h("tui-text", null, "b");
    });
    const appA = createApp(AppA);
    const appB = createApp(AppB);
    appA.mount({
      stdout: stdoutA,
      stdin,
      patchConsole: false,
      liveUpdates: true,
      maxFps: 0,
      kittyKeyboard: { mode: "disabled" },
    });
    appB.mount({
      stdout: stdoutB,
      stdin,
      patchConsole: false,
      liveUpdates: true,
      maxFps: 0,
      kittyKeyboard: { mode: "disabled" },
    });
    try {
      stdin.emit("data", "\x1b[");
      showFirst.value = false;
      await nextTick();
      stdin.emit("data", "A");
      await flushInput();

      expect({ persistentA, first, second, persistentB }).toEqual({
        persistentA: ["up"],
        first: [],
        second: [],
        persistentB: ["up"],
      });

      stdin.emit("data", "x");
      await flushInput();
      expect({ persistentA, first, second, persistentB }).toEqual({
        persistentA: ["up", "x"],
        first: [],
        second: ["x"],
        persistentB: ["up", "x"],
      });
    } finally {
      appA.unmount();
      appB.unmount();
      stdin.destroy();
      stdoutA.destroy();
      stdoutB.destroy();
    }
  });

  test("isActive false then true creates a fresh route lease", async () => {
    const { stream: stdin } = makeFakeStdin();
    const stdout = makeFakeWritable();
    const active = shallowRef(true);
    const persistent: string[] = [];
    const toggled: string[] = [];
    const App = defineComponent(() => {
      useInput((event) => {
        persistent.push(namedKeyOrInput(event, "up"));
        return "continue";
      });
      useInput(
        (event) => {
          toggled.push(namedKeyOrInput(event, "up"));
          return "continue";
        },
        { isActive: active },
      );
      return () => h("tui-text", null, "x");
    });
    const app = createApp(App);
    app.mount({
      stdout,
      stdin,
      patchConsole: false,
      liveUpdates: true,
      maxFps: 0,
      kittyKeyboard: { mode: "disabled" },
    });
    try {
      stdin.emit("data", "\x1b[");
      active.value = false;
      active.value = true;
      stdin.emit("data", "A");
      await flushInput();

      expect(persistent).toEqual(["up"]);
      expect(toggled).toEqual([]);

      stdin.emit("data", "x");
      await flushInput();
      expect(persistent).toEqual(["up", "x"]);
      expect(toggled).toEqual(["x"]);
    } finally {
      app.unmount();
      stdin.destroy();
      stdout.destroy();
    }
  });

  test("a handler ref update keeps its route lease and uses the latest callback", async () => {
    const { stream: stdin } = makeFakeStdin();
    const stdout = makeFakeWritable();
    const first: string[] = [];
    const second: string[] = [];
    const handler = shallowRef<InputHandler>((event) => {
      first.push(namedKeyOrInput(event, "up"));
      return "continue";
    });
    const App = defineComponent(() => {
      useInput(handler);
      return () => h("tui-text", null, "x");
    });
    const app = createApp(App);
    app.mount({
      stdout,
      stdin,
      patchConsole: false,
      liveUpdates: true,
      maxFps: 0,
      kittyKeyboard: { mode: "disabled" },
    });
    try {
      stdin.emit("data", "\x1b[");
      handler.value = (event) => {
        second.push(namedKeyOrInput(event, "up"));
        return "continue";
      };
      stdin.emit("data", "A");
      stdin.emit("data", "x");
      await flushInput();

      expect(first).toEqual([]);
      expect(second).toEqual(["up", "x"]);
    } finally {
      app.unmount();
      stdin.destroy();
      stdout.destroy();
    }
  });

  test("reentrant route changes affect the next fact, not current recipients", async () => {
    const { stream: stdin } = makeFakeStdin();
    const stdout = makeFakeWritable();
    const activeB = shallowRef(true);
    const activeC = shallowRef(false);
    const calls: string[] = [];
    const App = defineComponent(() => {
      useInput((event) => {
        const value = inputLabel(event);
        calls.push(`A:${value}`);
        if (value === "x") {
          activeB.value = false;
          activeC.value = true;
          stdin.emit("data", "y");
        }
        return "continue";
      });
      useInput(
        (event) => {
          calls.push(`B:${inputLabel(event)}`);
          return "continue";
        },
        { isActive: activeB },
      );
      useInput(
        (event) => {
          calls.push(`C:${inputLabel(event)}`);
          return "continue";
        },
        { isActive: activeC },
      );
      return () => h("tui-text", null, "x");
    });
    const app = createApp(App);
    app.mount({
      stdout,
      stdin,
      patchConsole: false,
      liveUpdates: true,
      maxFps: 0,
      kittyKeyboard: { mode: "disabled" },
    });
    try {
      stdin.emit("data", "x");
      await flushInput();

      expect(calls).toEqual(["A:x", "B:x", "A:y", "C:y"]);
    } finally {
      app.unmount();
      stdin.destroy();
      stdout.destroy();
    }
  });

  test("same-chunk route changes affect the next framed fact", async () => {
    const { stream: stdin } = makeFakeStdin();
    const stdout = makeFakeWritable();
    const activeB = shallowRef(true);
    const activeC = shallowRef(false);
    const calls: string[] = [];
    const App = defineComponent(() => {
      useInput((event) => {
        const value = inputLabel(event);
        calls.push(`A:${namedKeyOrInput(event, "backspace")}`);
        if (value === "x") {
          activeB.value = false;
          activeC.value = true;
        }
        return "continue";
      });
      useInput(
        (event) => {
          calls.push(`B:${namedKeyOrInput(event, "backspace")}`);
          return "continue";
        },
        { isActive: activeB },
      );
      useInput(
        (event) => {
          calls.push(`C:${namedKeyOrInput(event, "backspace")}`);
          return "continue";
        },
        { isActive: activeC },
      );
      return () => h("tui-text", null, "x");
    });
    const app = createApp(App);
    app.mount({
      stdout,
      stdin,
      patchConsole: false,
      liveUpdates: true,
      maxFps: 0,
      kittyKeyboard: { mode: "disabled" },
    });
    try {
      // Text and DEL are distinct framed facts even when one stream read batches
      // them. The first callback replaces B with C; B still completes the current
      // frozen delivery, while C owns the next fact just as it would in a second
      // data chunk.
      stdin.emit("data", "x\x7f");
      await flushInput();

      expect(calls).toEqual(["A:x", "B:x", "A:backspace", "C:backspace"]);
    } finally {
      app.unmount();
      stdin.destroy();
      stdout.destroy();
    }
  });

  test("same-chunk route changes bind a following split UTF-8 fact", async () => {
    const { stream: stdin } = makeFakeStdin();
    const stdout = makeFakeWritable();
    const activeB = shallowRef(true);
    const activeC = shallowRef(false);
    const calls: string[] = [];
    const App = defineComponent(() => {
      useInput((event) => {
        const value = inputLabel(event);
        calls.push(`A:${value}`);
        if (value === "x") {
          activeB.value = false;
          activeC.value = true;
        }
        return "continue";
      });
      useInput(
        (event) => {
          calls.push(`B:${inputLabel(event)}`);
          return "continue";
        },
        { isActive: activeB },
      );
      useInput(
        (event) => {
          calls.push(`C:${inputLabel(event)}`);
          return "continue";
        },
        { isActive: activeC },
      );
      return () => h("tui-text", null, "x");
    });
    const app = createApp(App);
    app.mount({
      stdout,
      stdin,
      patchConsole: false,
      liveUpdates: true,
      maxFps: 0,
      kittyKeyboard: { mode: "disabled" },
    });
    try {
      // The leading byte of € follows x in the same physical read, but it starts
      // a distinct UTF-8 fact. Its route is selected after x finishes, then held
      // while the continuation bytes arrive in the next read.
      stdin.emit("data", Uint8Array.from([0x78, 0xe2]));
      stdin.emit("data", Uint8Array.from([0x82, 0xac]));
      await flushInput();

      expect(calls).toEqual(["A:x", "B:x", "A:€", "C:€"]);
    } finally {
      app.unmount();
      stdin.destroy();
      stdout.destroy();
    }
  });

  test("same-chunk route changes bind a following split CSI fact", async () => {
    const { stream: stdin } = makeFakeStdin();
    const stdout = makeFakeWritable();
    const activeB = shallowRef(true);
    const activeC = shallowRef(false);
    const calls: string[] = [];
    const App = defineComponent(() => {
      useInput((event) => {
        const value = inputLabel(event);
        calls.push(`A:${namedKeyOrInput(event, "up")}`);
        if (value === "x") {
          activeB.value = false;
          activeC.value = true;
        }
        return "continue";
      });
      useInput(
        (event) => {
          calls.push(`B:${namedKeyOrInput(event, "up")}`);
          return "continue";
        },
        { isActive: activeB },
      );
      useInput(
        (event) => {
          calls.push(`C:${namedKeyOrInput(event, "up")}`);
          return "continue";
        },
        { isActive: activeC },
      );
      return () => h("tui-text", null, "x");
    });
    const app = createApp(App);
    app.mount({
      stdout,
      stdin,
      patchConsole: false,
      liveUpdates: true,
      maxFps: 0,
      kittyKeyboard: { mode: "disabled" },
    });
    try {
      stdin.emit("data", "x\x1b[");
      stdin.emit("data", "A");
      await flushInput();

      expect(calls).toEqual(["A:x", "B:x", "A:up", "C:up"]);
    } finally {
      app.unmount();
      stdin.destroy();
      stdout.destroy();
    }
  });

  test("same-chunk route changes bind a following split paste fact", async () => {
    const { stream: stdin } = makeFakeStdin();
    const stdout = makeFakeWritable();
    const activeB = shallowRef(true);
    const activeC = shallowRef(false);
    const inputs: string[] = [];
    const pastesB: string[] = [];
    const pastesC: string[] = [];
    const App = defineComponent(() => {
      useInput((event) => {
        if (event.kind === "paste") return "continue";
        const value = inputLabel(event);
        inputs.push(value);
        if (value === "x") {
          activeB.value = false;
          activeC.value = true;
        }
        return "continue";
      });
      useInput(collectPaste(pastesB), { isActive: activeB });
      useInput(collectPaste(pastesC), { isActive: activeC });
      return () => h("tui-text", null, "x");
    });
    const app = createApp(App);
    app.mount({
      stdout,
      stdin,
      patchConsole: false,
      liveUpdates: true,
      maxFps: 0,
      kittyKeyboard: { mode: "disabled" },
    });
    try {
      stdin.emit("data", "x\x1b[200~pasted");
      stdin.emit("data", "\x1b[201~");
      await flushInput();

      expect(inputs).toEqual(["x"]);
      expect(pastesB).toEqual([]);
      expect(pastesC).toEqual(["pasted"]);
    } finally {
      app.unmount();
      stdin.destroy();
      stdout.destroy();
    }
  });

  test("a replacement paste route cannot inherit a paste begun by its predecessor", async () => {
    const { stream: stdin } = makeFakeStdin();
    const stdout = makeFakeWritable();
    const showFirst = shallowRef(true);
    const inputs: string[] = [];
    const first: string[] = [];
    const second: string[] = [];
    const First = defineComponent(() => {
      useInput(collectPaste(first));
      return () => h("tui-text", null, "first");
    });
    const Second = defineComponent(() => {
      useInput(collectPaste(second));
      return () => h("tui-text", null, "second");
    });
    const App = defineComponent(() => {
      useInput(collectNonPasteInput(inputs));
      return () => h(showFirst.value ? First : Second);
    });
    const app = createApp(App);
    app.mount({
      stdout,
      stdin,
      patchConsole: false,
      liveUpdates: true,
      maxFps: 0,
      kittyKeyboard: { mode: "disabled" },
    });
    try {
      stdin.emit("data", "\x1b[200~head");
      showFirst.value = false;
      await nextTick();
      stdin.emit("data", "tail\x1b[201~");
      await flushInput();

      expect({ inputs, first, second }).toEqual({ inputs: [], first: [], second: [] });

      stdin.emit("data", "\x1b[200~next\x1b[201~");
      await flushInput();
      expect({ inputs, first, second }).toEqual({ inputs: [], first: [], second: ["next"] });
    } finally {
      app.unmount();
      stdin.destroy();
      stdout.destroy();
    }
  });

  test("a paste observer attached mid-paste cannot receive the old paste", async () => {
    const { stream: stdin } = makeFakeStdin();
    const stdout = makeFakeWritable();
    const pasteActive = shallowRef(false);
    const inputs: string[] = [];
    const pastes: string[] = [];
    const App = defineComponent(() => {
      useInput(collectInput(inputs));
      useInput(collectPaste(pastes), { isActive: pasteActive });
      return () => h("tui-text", null, "x");
    });
    const app = createApp(App);
    app.mount({
      stdout,
      stdin,
      patchConsole: false,
      liveUpdates: true,
      maxFps: 0,
      kittyKeyboard: { mode: "disabled" },
    });
    try {
      stdin.emit("data", "\x1b[200~head");
      pasteActive.value = true;
      stdin.emit("data", "tail\x1b[201~");
      await flushInput();

      expect(inputs).toEqual(["headtail"]);
      expect(pastes).toEqual([]);

      stdin.emit("data", "\x1b[200~next\x1b[201~");
      await flushInput();
      expect(inputs).toEqual(["headtail", "next"]);
      expect(pastes).toEqual(["next"]);
    } finally {
      app.unmount();
      stdin.destroy();
      stdout.destroy();
    }
  });

  test("a replacement mouse route cannot inherit a split SGR report", async () => {
    const previousTerm = process.env["TERM"];
    process.env["TERM"] = "xterm-256color";
    const { stream: stdin } = makeFakeStdin();
    const stdout = makeFakeWritable();
    const writes = captureWrites(stdout);
    const showFirst = shallowRef(true);
    const mouseActive = shallowRef(false);
    const inputs: string[] = [];
    const persistent: string[] = [];
    const first: string[] = [];
    const second: string[] = [];
    const First = defineComponent(() => {
      const target = shallowRef<ComponentPublicInstance | null>(null);
      useMouseEvent(
        target,
        "wheel",
        (event) => {
          first.push(wheelDirection(event));
          return "continue";
        },
        { isActive: mouseActive },
      );
      return () => h(Text, { ref: target }, () => "first");
    });
    const Second = defineComponent(() => {
      const target = shallowRef<ComponentPublicInstance | null>(null);
      useMouseEvent(
        target,
        "wheel",
        (event) => {
          second.push(wheelDirection(event));
          return "continue";
        },
        { isActive: mouseActive },
      );
      return () => h(Text, { ref: target }, () => "second");
    });
    const App = defineComponent(() => {
      const target = shallowRef<ComponentPublicInstance | null>(null);
      useInput(collectInput(inputs));
      useMouseEvent(
        target,
        "wheel",
        (event) => {
          persistent.push(wheelDirection(event));
          return "continue";
        },
        { isActive: mouseActive },
      );
      return () => h(Box, { ref: target }, () => h(showFirst.value ? First : Second));
    });
    const app = createApp(App);
    app.mount({
      stdout,
      stdin,
      patchConsole: false,
      liveUpdates: true,
      maxFps: 0,
      mode: "fullscreen",
      kittyKeyboard: { mode: "disabled" },
    });
    try {
      await waitForWrite(writes, "first");
      mouseActive.value = true;
      await waitForWrite(writes, "\x1b[?1000h\x1b[?1006h");
      stdin.emit("data", "\x1b[<64;1;");
      showFirst.value = false;
      await waitForWrite(writes, "second");
      stdin.emit("data", "1M");
      await flushInput();

      expect({ inputs, persistent, first, second }).toEqual({
        inputs: [],
        persistent: ["up"],
        first: [],
        second: [],
      });

      stdin.emit("data", "\x1b[<65;1;1M");
      await flushInput();
      expect({ inputs, persistent, first, second }).toEqual({
        inputs: [],
        persistent: ["up", "down"],
        first: [],
        second: ["down"],
      });
    } finally {
      app.unmount();
      if (previousTerm === undefined) delete process.env["TERM"];
      else process.env["TERM"] = previousTerm;
      stdin.destroy();
      stdout.destroy();
    }
  });

  test("mouse capture attached mid-report cannot reclassify the old report", async () => {
    const previousTerm = process.env["TERM"];
    process.env["TERM"] = "xterm-256color";
    const { stream: stdin } = makeFakeStdin();
    const stdout = makeFakeWritable();
    const writes = captureWrites(stdout);
    const mouseActive = shallowRef(false);
    const inputs: string[] = [];
    const mice: string[] = [];
    const App = defineComponent(() => {
      const target = shallowRef<ComponentPublicInstance | null>(null);
      useInput(collectInput(inputs));
      useMouseEvent(
        target,
        "wheel",
        (event) => {
          mice.push(wheelDirection(event));
          return "continue";
        },
        { isActive: mouseActive },
      );
      return () => h(Text, { ref: target }, () => "x");
    });
    const app = createApp(App);
    app.mount({
      stdout,
      stdin,
      patchConsole: false,
      liveUpdates: true,
      maxFps: 0,
      mode: "fullscreen",
      kittyKeyboard: { mode: "disabled" },
    });
    try {
      await waitForWrite(writes, "x");
      stdin.emit("data", "\x1b[<64;1;");
      mouseActive.value = true;
      await waitForWrite(writes, "\x1b[?1000h\x1b[?1006h");
      stdin.emit("data", "1M");
      await flushInput();

      expect(inputs).toEqual([]);
      expect(mice).toEqual([]);

      stdin.emit("data", "\x1b[<65;1;1M");
      await flushInput();
      expect(inputs).toEqual([]);
      expect(mice).toEqual(["down"]);
    } finally {
      app.unmount();
      if (previousTerm === undefined) delete process.env["TERM"];
      else process.env["TERM"] = previousTerm;
      stdin.destroy();
      stdout.destroy();
    }
  });

  test("consumer release clears a pending frame retained across suspend and resume", async () => {
    const { stream: stdin } = makeFakeStdin();
    const stdout = makeFakeWritable();
    const visible = shallowRef(true);
    const suspensionHost = createManualSuspensionHost();
    const Child = defineComponent(() => {
      useInput(observeInput);
      return () => h("tui-text", null, "input");
    });
    const App = defineComponent(
      () => () => (visible.value ? h(Child) : h("tui-text", null, "idle")),
    );
    const app = createApp(App);
    app.mount({
      stdout,
      stdin,
      patchConsole: false,
      liveUpdates: true,
      maxFps: 0,
      kittyKeyboard: { mode: "disabled" },
      [INTERNAL_SUSPENSION_HOST]: suspensionHost,
    } as Parameters<TuiApp["mount"]>[0]);
    try {
      stdin.emit("data", "\x1b[");
      await suspensionHost.suspend();
      await new Promise<void>((resolve) => setTimeout(resolve, 35));
      await suspensionHost.resume();
      visible.value = false;
      await nextTick();

      expect(stdin.listenerCount("data")).toBe(0);
    } finally {
      app.unmount();
      stdin.destroy();
      stdout.destroy();
    }
  });

  test.each([
    ["one physical chunk", ["a\x1b[200~p\x1b[201~b"]],
    ["three physical chunks", ["a", "\x1b[200~p\x1b[201~", "b"]],
  ])("suspension stops later semantic events independent of %s", async (_name, chunks) => {
    const stdout = makeFakeWritable();
    const { stream: stdin } = makeFakeStdin();
    const suspensionHost = createManualSuspensionHost();
    const inputs: string[] = [];
    const pastes: string[] = [];
    const App = defineComponent(() => {
      useInput((event) => {
        if (event.kind === "paste") return "continue";
        const value = inputLabel(event);
        inputs.push(value);
        if (value === "a") void suspensionHost.suspend();
        return "continue";
      });
      useInput(collectPaste(pastes));
      return () => h("tui-text", null, "x");
    });
    const app = createApp(App);
    app.mount({
      stdout,
      stdin,
      patchConsole: false,
      liveUpdates: true,
      maxFps: 0,
      [INTERNAL_SUSPENSION_HOST]: suspensionHost,
    } as Parameters<TuiApp["mount"]>[0]);
    try {
      for (const chunk of chunks) stdin.emit("data", chunk);
      await flushInput();

      expect(inputs).toEqual(["a"]);
      expect(pastes).toEqual([]);
    } finally {
      app.unmount();
      stdin.destroy();
      stdout.destroy();
    }
  });

  test("same-chunk suspension retains the following partial CSI context", async () => {
    const { stream: stdin } = makeFakeStdin();
    const stdoutA = makeFakeWritable();
    const stdoutB = makeFakeWritable();
    const suspensionHost = createManualSuspensionHost();
    const inputsA: string[] = [];
    const AppA = defineComponent(() => {
      useInput((event) => {
        const value = inputLabel(event);
        inputsA.push(value);
        if (value === "a") void suspensionHost.suspend();
        return "continue";
      });
      return () => h("tui-text", null, "a");
    });
    const appA = createApp(AppA);
    appA.mount({
      stdout: stdoutA,
      stdin,
      patchConsole: false,
      liveUpdates: true,
      maxFps: 0,
      kittyKeyboard: { mode: "disabled" },
      [INTERNAL_SUSPENSION_HOST]: suspensionHost,
    } as Parameters<TuiApp["mount"]>[0]);
    const b = mountInputAppOnStreams({ stdin, stdout: stdoutB, kittyMode: "disabled" });
    try {
      stdin.emit("data", "a\x1b[");
      await new Promise<void>((resolve) => setTimeout(resolve, 35));
      await suspensionHost.resume();
      stdin.emit("data", "Az");
      await flushInput();

      expect(inputsA).toEqual(["a", "z"]);
      expect(b.inputs).toEqual(["a", "", "z"]);
    } finally {
      appA.unmount();
      b.app.unmount();
      stdin.destroy();
      stdoutA.destroy();
      stdoutB.destroy();
    }
  });

  test("suspension drops an ambiguous lone Escape before the first resumed key", async () => {
    const { stream: stdin } = makeFakeStdin();
    const stdout = makeFakeWritable();
    const suspensionHost = createManualSuspensionHost();
    const { app, inputs } = mountInputAppOnStreams({
      stdin,
      stdout,
      kittyMode: "disabled",
      suspensionHost,
    });
    try {
      stdin.emit("data", "\x1b");
      await suspensionHost.suspend();
      await suspensionHost.resume();
      stdin.emit("data", "a");
      await flushInput();

      expect(inputs).toEqual(["a"]);
    } finally {
      app.unmount();
      stdin.destroy();
      stdout.destroy();
    }
  });

  test("same-chunk suspension retains the following partial paste context", async () => {
    const { stream: stdin } = makeFakeStdin();
    const stdoutA = makeFakeWritable();
    const stdoutB = makeFakeWritable();
    const suspensionHost = createManualSuspensionHost();
    const inputsA: string[] = [];
    const pastesA: string[] = [];
    const pastesB: string[] = [];
    const AppA = defineComponent(() => {
      useInput((event) => {
        if (event.kind === "paste") return "continue";
        const value = inputLabel(event);
        inputsA.push(value);
        if (value === "a") void suspensionHost.suspend();
        return "continue";
      });
      useInput(collectPaste(pastesA));
      return () => h("tui-text", null, "a");
    });
    const AppB = defineComponent(() => {
      useInput(observeInput);
      useInput(collectPaste(pastesB));
      return () => h("tui-text", null, "b");
    });
    const appA = createApp(AppA);
    const appB = createApp(AppB);
    appA.mount({
      stdout: stdoutA,
      stdin,
      patchConsole: false,
      liveUpdates: true,
      maxFps: 0,
      kittyKeyboard: { mode: "disabled" },
      [INTERNAL_SUSPENSION_HOST]: suspensionHost,
    } as Parameters<TuiApp["mount"]>[0]);
    appB.mount({
      stdout: stdoutB,
      stdin,
      patchConsole: false,
      liveUpdates: true,
      maxFps: 0,
      kittyKeyboard: { mode: "disabled" },
    });
    try {
      stdin.emit("data", "a\x1b[20");
      await new Promise<void>((resolve) => setTimeout(resolve, 35));
      await suspensionHost.resume();
      stdin.emit("data", "0~p\x1b[201~z");
      await flushInput();

      expect(inputsA).toEqual(["a", "z"]);
      expect(pastesA).toEqual([]);
      expect(pastesB).toEqual(["p"]);
    } finally {
      appA.unmount();
      appB.unmount();
      stdin.destroy();
      stdoutA.destroy();
      stdoutB.destroy();
    }
  });

  test("input emitted after reentrant suspension is not replayed on resume", async () => {
    const { stream: stdin } = makeFakeStdin();
    const stdoutA = makeFakeWritable();
    const stdoutB = makeFakeWritable();
    const suspensionHost = createManualSuspensionHost();
    const inputsA: string[] = [];
    const inputsB: string[] = [];
    const AppA = defineComponent(() => {
      useInput((event) => {
        const value = inputLabel(event);
        inputsA.push(value);
        if (value === "a") {
          void suspensionHost.suspend();
          stdin.emit("data", "x");
        }
        return "continue";
      });
      return () => h("tui-text", null, "a");
    });
    const AppB = defineComponent(() => {
      useInput(collectInput(inputsB));
      return () => h("tui-text", null, "b");
    });
    const appA = createApp(AppA);
    const appB = createApp(AppB);
    appA.mount({
      stdout: stdoutA,
      stdin,
      patchConsole: false,
      liveUpdates: true,
      [INTERNAL_SUSPENSION_HOST]: suspensionHost,
    } as Parameters<TuiApp["mount"]>[0]);
    appB.mount({
      stdout: stdoutB,
      stdin,
      patchConsole: false,
      liveUpdates: true,
    });
    try {
      stdin.emit("data", "a");
      await suspensionHost.resume();
      await flushInput();

      expect(inputsA).toEqual(["a"]);
      expect(inputsB).toEqual(["a", "x"]);
    } finally {
      appA.unmount();
      appB.unmount();
      stdin.destroy();
      stdoutA.destroy();
      stdoutB.destroy();
    }
  });

  test("an app resumed inside a shared paste skips to its end marker", async () => {
    const { stream: stdin } = makeFakeStdin();
    const stdoutA = makeFakeWritable();
    const stdoutB = makeFakeWritable();
    const suspensionHost = createManualSuspensionHost();
    const inputsA: string[] = [];
    const inputsB: string[] = [];
    const pastesA: string[] = [];
    const pastesB: string[] = [];
    const makeApp = (inputs: string[], pastes: string[]) =>
      defineComponent(() => {
        useInput(collectNonPasteInput(inputs));
        useInput(collectPaste(pastes));
        return () => h("tui-text", null, "x");
      });
    const appA = createApp(makeApp(inputsA, pastesA));
    const appB = createApp(makeApp(inputsB, pastesB));
    appA.mount({
      stdout: stdoutA,
      stdin,
      patchConsole: false,
      liveUpdates: true,
      [INTERNAL_SUSPENSION_HOST]: suspensionHost,
    } as Parameters<TuiApp["mount"]>[0]);
    appB.mount({
      stdout: stdoutB,
      stdin,
      patchConsole: false,
      liveUpdates: true,
    });
    try {
      stdin.emit("data", "\x1b[200~before");
      await suspensionHost.suspend();
      stdin.emit("data", "middle");
      await suspensionHost.resume();
      stdin.emit("data", "after\x1b[201~z");
      await flushInput();

      expect({ inputs: inputsA, pastes: pastesA }).toEqual({ inputs: ["z"], pastes: [] });
      expect({ inputs: inputsB, pastes: pastesB }).toEqual({
        inputs: ["z"],
        pastes: ["beforemiddleafter"],
      });
    } finally {
      appA.unmount();
      appB.unmount();
      stdin.destroy();
      stdoutA.destroy();
      stdoutB.destroy();
    }
  });

  test("the sole app resumed inside a paste recovers after its end", async () => {
    const { stream: stdin } = makeFakeStdin();
    const stdout = makeFakeWritable();
    const suspensionHost = createManualSuspensionHost();
    const inputs: string[] = [];
    const pastes: string[] = [];
    const App = defineComponent(() => {
      useInput(collectNonPasteInput(inputs));
      useInput(collectPaste(pastes));
      return () => h("tui-text", null, "x");
    });
    const app = createApp(App);
    app.mount({
      stdout,
      stdin,
      patchConsole: false,
      liveUpdates: true,
      [INTERNAL_SUSPENSION_HOST]: suspensionHost,
    } as Parameters<TuiApp["mount"]>[0]);
    try {
      stdin.emit("data", "\x1b[200~before");
      await suspensionHost.suspend();
      await suspensionHost.resume();
      stdin.emit("data", "after\x1b[201~z");
      await flushInput();

      expect(inputs).toEqual(["z"]);
      expect(pastes).toEqual([]);
    } finally {
      app.unmount();
      stdin.destroy();
      stdout.destroy();
    }
  });

  test("reactivation during a partial paste start excludes the old paste but keeps later input", async () => {
    const { stream: stdin } = makeFakeStdin();
    const stdoutA = makeFakeWritable();
    const stdoutB = makeFakeWritable();
    const suspensionHost = createManualSuspensionHost();
    const inputsA: string[] = [];
    const inputsB: string[] = [];
    const pastesA: string[] = [];
    const pastesB: string[] = [];
    const makeApp = (inputs: string[], pastes: string[]) =>
      defineComponent(() => {
        useInput(collectNonPasteInput(inputs));
        useInput(collectPaste(pastes));
        return () => h("tui-text", null, "x");
      });
    const appA = createApp(makeApp(inputsA, pastesA));
    const appB = createApp(makeApp(inputsB, pastesB));
    appA.mount({
      stdout: stdoutA,
      stdin,
      patchConsole: false,
      liveUpdates: true,
      [INTERNAL_SUSPENSION_HOST]: suspensionHost,
    } as Parameters<TuiApp["mount"]>[0]);
    appB.mount({
      stdout: stdoutB,
      stdin,
      patchConsole: false,
      liveUpdates: true,
    });
    try {
      stdin.emit("data", "\x1b[20");
      await new Promise<void>((resolve) => setTimeout(resolve, 35));
      await suspensionHost.suspend();
      await suspensionHost.resume();
      stdin.emit("data", "0~p\x1b[201~z");
      await flushInput();

      expect({ inputs: inputsA, pastes: pastesA }).toEqual({ inputs: ["z"], pastes: [] });
      expect({ inputs: inputsB, pastes: pastesB }).toEqual({ inputs: ["z"], pastes: ["p"] });
    } finally {
      appA.unmount();
      appB.unmount();
      stdin.destroy();
      stdoutA.destroy();
      stdoutB.destroy();
    }
  });

  test("a slow partial paste start remains one paste without suspension", async () => {
    const { stream: stdin } = makeFakeStdin();
    const stdout = makeFakeWritable();
    const inputs: string[] = [];
    const pastes: string[] = [];
    const App = defineComponent(() => {
      useInput(collectNonPasteInput(inputs));
      useInput(collectPaste(pastes));
      return () => h("tui-text", null, "x");
    });
    const app = createApp(App);
    app.mount({
      stdout,
      stdin,
      patchConsole: false,
      liveUpdates: true,
      maxFps: 0,
      kittyKeyboard: { mode: "disabled" },
    });
    try {
      stdin.emit("data", "\x1b[20");
      await new Promise<void>((resolve) => setTimeout(resolve, 35));
      stdin.emit("data", "0~p\x1b[201~z");
      await flushInput();

      expect(inputs).toEqual(["z"]);
      expect(pastes).toEqual(["p"]);
    } finally {
      app.unmount();
      stdin.destroy();
      stdout.destroy();
    }
  });

  test("reactivation cannot receive the tail of a CSI key begun before suspension", async () => {
    const { stream: stdin } = makeFakeStdin();
    const stdoutA = makeFakeWritable();
    const stdoutB = makeFakeWritable();
    const suspensionHost = createManualSuspensionHost();
    const a = mountInputAppOnStreams({ stdin, stdout: stdoutA, suspensionHost });
    const b = mountInputAppOnStreams({ stdin, stdout: stdoutB });
    try {
      stdin.emit("data", "\x1b[");
      await suspensionHost.suspend();
      await new Promise<void>((resolve) => setTimeout(resolve, 35));
      await suspensionHost.resume();
      stdin.emit("data", "A");
      await flushInput();

      expect(a.inputs).toEqual([]);
      expect(b.inputs).toEqual([""]);
    } finally {
      a.app.unmount();
      b.app.unmount();
      stdin.destroy();
      stdoutA.destroy();
      stdoutB.destroy();
    }
  });

  test("reactivation cannot receive a UTF-8 scalar begun while suspended", async () => {
    const { stream: stdin } = makeFakeStdin();
    const stdoutA = makeFakeWritable();
    const stdoutB = makeFakeWritable();
    const suspensionHost = createManualSuspensionHost();
    const a = mountInputAppOnStreams({ stdin, stdout: stdoutA, suspensionHost });
    const b = mountInputAppOnStreams({ stdin, stdout: stdoutB });
    try {
      await suspensionHost.suspend();
      stdin.emit("data", new Uint8Array([0xf0, 0x9f]));
      await suspensionHost.resume();
      stdin.emit("data", new Uint8Array([0x92, 0xa9, 0x7a]));
      await flushInput();

      expect(a.inputs).toEqual(["z"]);
      expect(b.inputs).toEqual(["💩", "z"]);
    } finally {
      a.app.unmount();
      b.app.unmount();
      stdin.destroy();
      stdoutA.destroy();
      stdoutB.destroy();
    }
  });

  test("the production ingress keeps raw byte boundaries instead of installing a decoder", async () => {
    const stdin = makeRawByteStdin();
    const stdoutA = makeFakeWritable();
    const stdoutB = makeFakeWritable();
    const suspensionHost = createManualSuspensionHost();
    const a = mountInputAppOnStreams({
      stdin,
      stdout: stdoutA,
      kittyMode: "disabled",
      suspensionHost,
    });
    const b = mountInputAppOnStreams({ stdin, stdout: stdoutB, kittyMode: "disabled" });
    try {
      await suspensionHost.suspend();
      stdin.write(new Uint8Array([0xf0, 0x9f]));
      await suspensionHost.resume();
      stdin.write(new Uint8Array([0x92, 0xa9, 0x7a]));
      await flushInput();

      expect(stdin.readableEncoding).toBeNull();
      expect(a.inputs).toEqual(["z"]);
      expect(b.inputs).toEqual(["💩", "z"]);
    } finally {
      a.app.unmount();
      b.app.unmount();
      stdin.destroy();
      stdoutA.destroy();
      stdoutB.destroy();
    }
  });

  test.each([
    ["E0 overlong", [0xe0], [0x80, 0x80], "��"],
    ["ED surrogate", [0xed], [0xa0, 0x80], "��"],
    ["F0 overlong", [0xf0], [0x80, 0x80, 0x80], "���"],
    ["F4 above Unicode", [0xf4], [0x90, 0x80, 0x80], "���"],
  ] as const)(
    "invalid UTF-8 keeps later byte recipients (%s)",
    async (_name, leadingBytes, laterBytes, expectedLaterText) => {
      const stdin = makeRawByteStdin();
      const stdoutA = makeFakeWritable();
      const stdoutB = makeFakeWritable();
      const suspensionHost = createManualSuspensionHost();
      const a = mountInputAppOnStreams({
        stdin,
        stdout: stdoutA,
        kittyMode: "disabled",
        suspensionHost,
      });
      try {
        stdin.write(new Uint8Array(leadingBytes));
        await suspensionHost.suspend();
        const b = mountInputAppOnStreams({ stdin, stdout: stdoutB, kittyMode: "disabled" });
        try {
          stdin.write(new Uint8Array(laterBytes));
          await flushInput();

          expect(a.inputs).toEqual([]);
          expect(b.inputs.join("")).toBe(expectedLaterText);
        } finally {
          b.app.unmount();
        }
      } finally {
        a.app.unmount();
        stdin.destroy();
        stdoutA.destroy();
        stdoutB.destroy();
      }
    },
  );

  test("a string chunk terminates pending bytes before its own text", async () => {
    const stdin = makeRawByteStdin();
    const stdoutA = makeFakeWritable();
    const stdoutB = makeFakeWritable();
    const suspensionHost = createManualSuspensionHost();
    const a = mountInputAppOnStreams({
      stdin,
      stdout: stdoutA,
      kittyMode: "disabled",
      suspensionHost,
    });
    try {
      stdin.write(new Uint8Array([0xf0, 0x9f]));
      await suspensionHost.suspend();
      const b = mountInputAppOnStreams({ stdin, stdout: stdoutB, kittyMode: "disabled" });
      try {
        stdin.emit("data", "x");
        stdin.write(new Uint8Array([0x92, 0xa9]));
        await flushInput();

        expect(a.inputs).toEqual([]);
        expect(b.inputs).toEqual(["x", "��"]);
      } finally {
        b.app.unmount();
      }
    } finally {
      a.app.unmount();
      stdin.destroy();
      stdoutA.destroy();
      stdoutB.destroy();
    }
  });

  test("owner cancellation cannot move a held prefix before earlier input", async () => {
    const { stream: stdin } = makeFakeStdin();
    const stdoutA = makeFakeWritable();
    const stdoutB = makeFakeWritable();
    const suspensionHost = createManualSuspensionHost();
    const inputsA: string[] = [];
    const AppA = defineComponent(() => {
      useInput((event) => {
        const value = inputLabel(event);
        inputsA.push(value);
        if (value === "a") void suspensionHost.suspend();
        return "continue";
      });
      return () => h("tui-text", null, "a");
    });
    const appA = createApp(AppA);
    appA.mount({
      stdout: stdoutA,
      stdin,
      patchConsole: false,
      liveUpdates: true,
      kittyKeyboard: { mode: "auto" },
      [INTERNAL_SUSPENSION_HOST]: suspensionHost,
    } as Parameters<TuiApp["mount"]>[0]);
    const b = mountInputAppOnStreams({ stdin, stdout: stdoutB, kittyMode: "disabled" });
    try {
      stdin.emit("data", "a\x1b");
      await new Promise<void>((resolve) => setTimeout(resolve, 30));

      expect(inputsA).toEqual(["a"]);
      expect(b.inputs).toEqual(["a", ""]);
    } finally {
      appA.unmount();
      b.app.unmount();
      stdin.destroy();
      stdoutA.destroy();
      stdoutB.destroy();
    }
  });

  test("cancelling one query releases a safe prefix only to the other active app", async () => {
    const { stream: stdin } = makeFakeStdin();
    const stdoutA = makeFakeWritable();
    const stdoutB = makeFakeWritable();
    const suspensionHost = createManualSuspensionHost();
    const a = mountInputAppOnStreams({
      stdin,
      stdout: stdoutA,
      kittyMode: "auto",
      suspensionHost,
    });
    const b = mountInputAppOnStreams({ stdin, stdout: stdoutB, kittyMode: "disabled" });
    try {
      stdin.emit("data", "\x1b");
      await suspensionHost.suspend();
      await new Promise<void>((resolve) => setTimeout(resolve, 30));

      expect(a.inputs).toEqual([]);
      expect(b.inputs).toEqual([""]);
    } finally {
      a.app.unmount();
      b.app.unmount();
      stdin.destroy();
      stdoutA.destroy();
      stdoutB.destroy();
    }
  });

  test("reply-shaped bytes inside bracketed paste remain application payload", async () => {
    const stdout = makeFakeWritable();
    const { stream: stdin } = makeFakeStdin();
    const input = stdin as WritableTestStdin;
    const pastes: string[] = [];
    const App = defineComponent(() => {
      useInput(collectPaste(pastes));
      return () => h("tui-text", null, "x");
    });
    const app = createApp(App);
    app.mount({
      stdout,
      stdin,
      patchConsole: false,
      liveUpdates: true,
      maxFps: 0,
      kittyKeyboard: { mode: "auto" },
    });
    try {
      input.write("\x1b[200~before\x1b[?1uafter\x1b[201~");
      await flushInput();

      expect(pastes).toEqual(["before\x1b[?1uafter"]);
    } finally {
      app.unmount();
      stdin.destroy();
      stdout.destroy();
    }
  });

  test.each(["auto-first", "disabled-first"] as const)(
    "auto and disabled apps do not diverge on a slow reply split (%s)",
    async (order) => {
      const { stream: stdin } = makeFakeStdin();
      const input = stdin as WritableTestStdin;
      const stdoutAuto = makeFakeWritable();
      const stdoutDisabled = makeFakeWritable();
      const mountAuto = () =>
        mountInputAppOnStreams({ stdin, stdout: stdoutAuto, kittyMode: "auto" });
      const mountDisabled = () =>
        mountInputAppOnStreams({ stdin, stdout: stdoutDisabled, kittyMode: "disabled" });
      const first = order === "auto-first" ? mountAuto() : mountDisabled();
      const second = order === "auto-first" ? mountDisabled() : mountAuto();
      const auto = order === "auto-first" ? first : second;
      const disabled = order === "auto-first" ? second : first;
      try {
        input.write("\x1b[?");
        await new Promise<void>((resolve) => setTimeout(resolve, 35));
        input.write("1u");
        await flushInput();

        expect(auto.inputs).toEqual([]);
        expect(disabled.inputs).toEqual(auto.inputs);
      } finally {
        first.app.unmount();
        second.app.unmount();
        stdin.destroy();
        stdoutAuto.destroy();
        stdoutDisabled.destroy();
      }
    },
  );

  test("a detector that is still active owns a reply after another app times out", async () => {
    const { stream: stdin } = makeFakeStdin();
    const input = stdin as WritableTestStdin;
    const stdoutA = makeFakeWritable();
    const stdoutB = makeFakeWritable();
    const a = mountInputAppOnStreams({ stdin, stdout: stdoutA, kittyMode: "auto" });
    await new Promise<void>((resolve) => setTimeout(resolve, 60));
    const b = mountInputAppOnStreams({ stdin, stdout: stdoutB, kittyMode: "auto" });
    try {
      await new Promise<void>((resolve) => setTimeout(resolve, 160));
      input.write("\x1b[?1u");
      await flushInput();

      expect(a.inputs).toEqual([]);
      expect(b.inputs).toEqual([]);
    } finally {
      a.app.unmount();
      b.app.unmount();
      stdin.destroy();
      stdoutA.destroy();
      stdoutB.destroy();
    }
  });

  test("each overlapping query owns one response, including a slow second response", async () => {
    const { stream: stdin } = makeFakeStdin();
    const input = stdin as WritableTestStdin;
    const stdoutA = makeFakeWritable();
    const stdoutB = makeFakeWritable();
    const a = mountInputAppOnStreams({ stdin, stdout: stdoutA, kittyMode: "auto" });
    const b = mountInputAppOnStreams({ stdin, stdout: stdoutB, kittyMode: "auto" });
    try {
      input.write("\x1b[?1u");
      input.write("\x1b[?");
      await new Promise<void>((resolve) => setTimeout(resolve, 35));
      input.write("1u");
      await flushInput();

      expect(a.inputs).toEqual([]);
      expect(b.inputs).toEqual([]);
    } finally {
      a.app.unmount();
      b.app.unmount();
      stdin.destroy();
      stdoutA.destroy();
      stdoutB.destroy();
    }
  });

  test("a reply completed after the finite detection window is ordinary input", async () => {
    const stdout = makeFakeWritable();
    const { stream: stdin } = makeFakeStdin();
    const input = stdin as WritableTestStdin;
    const { app, inputs } = mountInputAppOnStreams({ stdin, stdout, kittyMode: "auto" });
    try {
      input.write("\x1b[?1");
      await new Promise<void>((resolve) => setTimeout(resolve, 230));
      input.write("u");
      await flushInput();

      expect(inputs).toEqual(["u"]);
    } finally {
      app.unmount();
      stdin.destroy();
      stdout.destroy();
    }
  });
});
