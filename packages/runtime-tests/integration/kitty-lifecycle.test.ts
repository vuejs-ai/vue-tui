import { describe, test, expect, vi } from "vite-plus/test";
import EventEmitter from "node:events";
import {
  createKittyKeyboardController,
  matchKittyQueryResponse,
  hasCompleteKittyQueryResponse,
  stripKittyQueryResponsesAndTrailingPartial,
  resolveFlags,
} from "@vue-tui/runtime/internal";
import { createApp } from "@vue-tui/runtime";
import { defineComponent } from "vue";

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
  const unshifted: Uint8Array[] = [];
  stdin.unshift = ((chunk: Uint8Array) => {
    unshifted.push(Uint8Array.from(chunk));
    return true;
  }) as typeof stdin.unshift;
  return { stdin, unshifted };
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
    const ctrl = createKittyKeyboardController(stdin, stdout);

    ctrl.init({ mode: "enabled" }, true);
    expect(written).toContain("\x1b[>1u");
    expect(ctrl.isEnabled).toBe(true);

    ctrl.dispose();
  });

  test("writes disable sequence on dispose", () => {
    const { stdout, written } = createFakeStdout();
    const { stdin } = createFakeStdin();
    const ctrl = createKittyKeyboardController(stdin, stdout);

    ctrl.init({ mode: "enabled" }, true);
    ctrl.dispose();
    expect(written).toContain("\x1b[<u");
    expect(ctrl.isEnabled).toBe(false);
  });

  test("not enabled when stdin is not TTY", () => {
    const { stdout, written } = createFakeStdout();
    const { stdin } = createFakeStdin();
    (stdin as any).isTTY = false;
    const ctrl = createKittyKeyboardController(stdin, stdout);

    ctrl.init({ mode: "enabled" }, true);
    expect(written).not.toContain("\x1b[>1u");
    expect(ctrl.isEnabled).toBe(false);

    ctrl.dispose();
  });

  test("not enabled when stdout is not TTY", () => {
    const { stdout, written } = createFakeStdout();
    (stdout as any).isTTY = false;
    const { stdin } = createFakeStdin();
    const ctrl = createKittyKeyboardController(stdin, stdout);

    ctrl.init({ mode: "enabled" }, true);
    expect(written).not.toContain("\x1b[>1u");

    ctrl.dispose();
  });
});

describe("kitty lifecycle - opt-in behavior", () => {
  test("no-op when kittyKeyboard is absent", () => {
    const { stdout, written } = createFakeStdout();
    const { stdin } = createFakeStdin();
    const ctrl = createKittyKeyboardController(stdin, stdout);

    ctrl.init(undefined, true);
    expect(written.filter((s) => s.includes("\x1b[>"))).toHaveLength(0);
    expect(ctrl.isEnabled).toBe(false);

    ctrl.dispose();
  });

  test("no-op when mode is disabled", () => {
    const { stdout, written } = createFakeStdout();
    const { stdin } = createFakeStdin();
    const ctrl = createKittyKeyboardController(stdin, stdout);

    ctrl.init({ mode: "disabled" }, true);
    expect(written.filter((s) => s.includes("\x1b[>"))).toHaveLength(0);
    expect(ctrl.isEnabled).toBe(false);

    ctrl.dispose();
  });
});

describe("kitty lifecycle - custom flags", () => {
  test("enabled mode with custom flags writes correct bitmask", () => {
    const { stdout, written } = createFakeStdout();
    const { stdin } = createFakeStdin();
    const ctrl = createKittyKeyboardController(stdin, stdout);

    ctrl.init({ mode: "enabled", flags: ["disambiguateEscapeCodes", "reportEventTypes"] }, true);
    expect(written).toContain("\x1b[>3u");

    ctrl.dispose();
  });

  test("auto mode with custom flags passes them through", () => {
    const { stdout } = createFakeStdout();
    const { stdin } = createFakeStdin();
    const writtenStrings: string[] = [];

    stdout.write = ((data: string) => {
      writtenStrings.push(data);
      if (data === "\x1b[?u") {
        stdin.emit("data", "\x1b[?1u");
      }
      return true;
    }) as typeof stdout.write;

    const ctrl = createKittyKeyboardController(stdin, stdout);
    ctrl.init({ mode: "auto", flags: ["disambiguateEscapeCodes", "reportEventTypes"] }, true);

    expect(writtenStrings).toContain("\x1b[>3u");
    ctrl.dispose();
  });
});

describe("kitty lifecycle - auto-detection", () => {
  test("enables protocol when terminal responds", () => {
    const { stdout, written } = createFakeStdout();
    const { stdin } = createFakeStdin();
    const ctrl = createKittyKeyboardController(stdin, stdout);

    ctrl.init({ mode: "auto" }, true);
    stdin.emit("data", "\x1b[?1u");

    expect(written).toContain("\x1b[>1u");
    expect(ctrl.isEnabled).toBe(true);

    ctrl.dispose();
  });

  test("handles synchronous query response", () => {
    const { stdout } = createFakeStdout();
    const { stdin } = createFakeStdin();
    const writtenStrings: string[] = [];

    stdout.write = ((data: string) => {
      writtenStrings.push(data);
      if (data === "\x1b[?u") {
        stdin.emit("data", "\x1b[?1u");
      }
      return true;
    }) as typeof stdout.write;

    const ctrl = createKittyKeyboardController(stdin, stdout);
    ctrl.init({ mode: "auto" }, true);

    expect(writtenStrings).toContain("\x1b[>1u");
    ctrl.dispose();
  });

  test("handles Uint8Array response", () => {
    const { stdout, written } = createFakeStdout();
    const { stdin } = createFakeStdin();
    const ctrl = createKittyKeyboardController(stdin, stdout);

    ctrl.init({ mode: "auto" }, true);
    stdin.emit("data", textEncoder.encode("\x1b[?1u"));

    expect(written).toContain("\x1b[>1u");
    ctrl.dispose();
  });

  test("does not enable after dispose", () => {
    const { stdout, written } = createFakeStdout();
    const { stdin } = createFakeStdin();
    const ctrl = createKittyKeyboardController(stdin, stdout);

    ctrl.init({ mode: "auto" }, true);
    ctrl.dispose();
    stdin.emit("data", "\x1b[?1u");

    expect(written.filter((s) => s === "\x1b[>1u")).toHaveLength(0);
  });

  test("preserves split UTF-8 input bytes", async () => {
    const { stdout } = createFakeStdout();
    const { stdin, unshifted } = createFakeStdin();
    const ctrl = createKittyKeyboardController(stdin, stdout);

    ctrl.init({ mode: "auto" }, true);

    stdin.emit("data", new Uint8Array([0xf0, 0x9f]));
    stdin.emit("data", new Uint8Array([0x92, 0xa9]));

    await new Promise((r) => setTimeout(r, 250));

    const allBytes: number[] = [];
    for (const chunk of unshifted) {
      for (const b of chunk) allBytes.push(b);
    }
    expect(allBytes).toEqual([0xf0, 0x9f, 0x92, 0xa9]);

    ctrl.dispose();
  });

  test("timeout does not leak partial query response", async () => {
    const { stdout } = createFakeStdout();
    const { stdin, unshifted } = createFakeStdin();
    const ctrl = createKittyKeyboardController(stdin, stdout);

    ctrl.init({ mode: "auto" }, true);
    stdin.emit("data", "\x1b[?1");

    await new Promise((r) => setTimeout(r, 250));

    expect(unshifted).toHaveLength(0);
    ctrl.dispose();
  });

  test("timeout preserves query prefix without digits", async () => {
    const { stdout, written } = createFakeStdout();
    const { stdin, unshifted } = createFakeStdin();
    const ctrl = createKittyKeyboardController(stdin, stdout);

    ctrl.init({ mode: "auto" }, true);
    stdin.emit("data", "\x1b[?");

    await new Promise((r) => setTimeout(r, 250));

    expect(written.filter((s) => s === "\x1b[>1u")).toHaveLength(0);
    expect(unshifted.map((c) => [...c])).toEqual([[0x1b, 0x5b, 0x3f]]);

    ctrl.dispose();
  });

  test("ignores response without digits", async () => {
    const { stdout, written } = createFakeStdout();
    const { stdin, unshifted } = createFakeStdin();
    const ctrl = createKittyKeyboardController(stdin, stdout);

    ctrl.init({ mode: "auto" }, true);
    stdin.emit("data", "\x1b[?u");

    await new Promise((r) => setTimeout(r, 250));

    expect(written.filter((s) => s === "\x1b[>1u")).toHaveLength(0);
    expect(unshifted.map((c) => [...c])).toEqual([[0x1b, 0x5b, 0x3f, 0x75]]);

    ctrl.dispose();
  });

  test("preserves invalid query-like escape sequence", async () => {
    const { stdout, written } = createFakeStdout();
    const { stdin, unshifted } = createFakeStdin();
    const ctrl = createKittyKeyboardController(stdin, stdout);

    ctrl.init({ mode: "auto" }, true);
    stdin.emit("data", "\x1b[?1x");

    await new Promise((r) => setTimeout(r, 250));

    expect(written.filter((s) => s === "\x1b[>1u")).toHaveLength(0);
    expect(unshifted.map((c) => [...c])).toEqual([[0x1b, 0x5b, 0x3f, 0x31, 0x78]]);

    ctrl.dispose();
  });

  test("response \\x1b[?0u is valid support confirmation", () => {
    const { stdout, written } = createFakeStdout();
    const { stdin } = createFakeStdin();
    const ctrl = createKittyKeyboardController(stdin, stdout);

    ctrl.init({ mode: "auto" }, true);
    stdin.emit("data", "\x1b[?0u");

    expect(written).toContain("\x1b[>1u");
    ctrl.dispose();
  });

  test("split response across two data chunks", () => {
    const { stdout, written } = createFakeStdout();
    const { stdin } = createFakeStdin();
    const ctrl = createKittyKeyboardController(stdin, stdout);

    ctrl.init({ mode: "auto" }, true);
    stdin.emit("data", "\x1b[?");
    stdin.emit("data", "1u");

    expect(written).toContain("\x1b[>1u");
    ctrl.dispose();
  });

  test("non-query bytes interleaved with response are re-emitted", () => {
    const { stdout } = createFakeStdout();
    const { stdin, unshifted } = createFakeStdin();
    const ctrl = createKittyKeyboardController(stdin, stdout);

    ctrl.init({ mode: "auto" }, true);
    stdin.emit("data", "a\x1b[?1ub");

    const allBytes: number[] = [];
    for (const chunk of unshifted) {
      for (const b of chunk) allBytes.push(b);
    }
    expect(allBytes).toEqual([0x61, 0x62]);
    ctrl.dispose();
  });
});

// --- Render-level integration tests ---

const Dummy = defineComponent(() => () => null);

describe("kitty lifecycle - mount/unmount integration", () => {
  test("mount with kittyKeyboard enabled writes enable sequence", () => {
    const { stdout, written } = createFakeStdout();
    const { stdin } = createFakeStdin();

    const app = createApp(Dummy);
    app.mount({
      stdout: stdout as unknown as NodeJS.WriteStream,
      stdin: stdin as unknown as NodeJS.ReadStream,
      kittyKeyboard: { mode: "enabled" },
    });

    expect(written).toContain("\x1b[>1u");
    app.unmount();
  });

  test("unmount writes disable sequence", () => {
    const { stdout, written } = createFakeStdout();
    const { stdin } = createFakeStdin();

    const app = createApp(Dummy);
    app.mount({
      stdout: stdout as unknown as NodeJS.WriteStream,
      stdin: stdin as unknown as NodeJS.ReadStream,
      kittyKeyboard: { mode: "enabled" },
    });

    app.unmount();
    expect(written).toContain("\x1b[<u");
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
