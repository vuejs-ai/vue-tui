import EventEmitter from "node:events";
import { expect, test, vi } from "vite-plus/test";
import { NodeTerminalBackend } from "../../../src/terminal/node/backend.ts";

function createReadable(): NodeJS.ReadStream & { readonly setRawMode: ReturnType<typeof vi.fn> } {
  const stream = new EventEmitter() as NodeJS.ReadStream & {
    readonly setRawMode: ReturnType<typeof vi.fn>;
  };
  Object.assign(stream, {
    isTTY: true,
    readable: true,
    setRawMode: vi.fn(),
  });
  return stream;
}

function createWritable(): NodeJS.WriteStream & { readonly writes: string[] } {
  const stream = new EventEmitter() as NodeJS.WriteStream & { readonly writes: string[] };
  const writes: string[] = [];
  Object.assign(stream, {
    isTTY: true,
    writable: true,
    columns: 120,
    rows: 40,
    writes,
    getColorDepth: vi.fn(() => 24),
    write(data: string) {
      writes.push(data);
      return true;
    },
  });
  return stream;
}

test("NodeTerminalBackend keeps streams behind terminal facts, events, and writes", () => {
  const stdin = createReadable();
  const stdout = createWritable();
  const stderr = createWritable();
  const terminal = new NodeTerminalBackend({ stdin, stdout, stderr });
  const data = vi.fn();
  const resize = vi.fn();
  const outputError = vi.fn();

  const stopData = terminal.onData(data);
  const stopResize = terminal.onResize(resize);
  const stopError = terminal.onOutputEvent("stderr", "error", outputError);

  terminal.setRawMode(true);
  terminal.write("stdout", "frame");
  terminal.writeSync("stderr", "error");
  stdin.emit("data", "a");
  stdout.emit("resize");
  const failure = new Error("stderr failed");
  stderr.emit("error", failure);

  expect(terminal.capabilities.stdin).toMatchObject({ isTTY: true, canSetRawMode: true });
  expect(terminal.capabilities.stdout).toMatchObject({
    isTTY: true,
    canWrite: true,
    colorDepth: 24,
  });
  expect(terminal.size).toEqual({ columns: 120, rows: 40 });
  expect(stdin.setRawMode).toHaveBeenCalledWith(true);
  expect(stdout.writes).toEqual(["frame"]);
  expect(stderr.writes).toEqual(["error"]);
  expect(data).toHaveBeenCalledWith("a");
  expect(resize).toHaveBeenCalledOnce();
  expect(outputError).toHaveBeenCalledWith(failure);
  stopData();
  stopResize();
  stopError();
});

test("the colour probe receives an environment without colour-control overrides", () => {
  const stdout = createWritable();
  const probe = vi.fn(() => 24);
  Object.assign(stdout, { getColorDepth: probe });
  const backend = new NodeTerminalBackend({
    stdin: createReadable(),
    stdout,
    stderr: createWritable(),
    environment: {
      FORCE_COLOR: undefined,
      NO_COLOR: "",
      NODE_DISABLE_COLORS: "",
      TERM: "xterm-256color",
    },
  });

  // `NO_COLOR` must keep non-colour attributes on a capable TTY; handing it to
  // Node's probe would report depth 1 and drop them with the colours.
  expect(backend.capabilities.stdout.colorDepth).toBe(24);
  expect(probe).toHaveBeenCalledWith({ TERM: "xterm-256color" });
});

test("the colour depth is probed once, not once per capabilities read", () => {
  let probes = 0;
  const stdout = createWritable();
  Object.assign(stdout, {
    getColorDepth() {
      probes++;
      return 24;
    },
  });
  const backend = new NodeTerminalBackend({
    stdin: createReadable(),
    stdout,
    stderr: createWritable(),
  });

  void backend.capabilities.stdout.colorDepth;
  void backend.capabilities.stdout.colorDepth;

  expect(probes).toBe(1);
});

test("unrelated capability reads do not probe either output's colour depth", () => {
  const stdout = createWritable();
  const stderr = createWritable();
  const stdoutProbe = vi.fn(() => 24);
  const stderrProbe = vi.fn(() => 8);
  Object.assign(stdout, { getColorDepth: stdoutProbe });
  Object.assign(stderr, { getColorDepth: stderrProbe });
  const backend = new NodeTerminalBackend({ stdin: createReadable(), stdout, stderr });
  const capabilities = backend.capabilities;

  expect(backend.capabilities).toBe(capabilities);
  expect(capabilities.stdin.canRead).toBe(true);
  expect(capabilities.stdout.isTTY).toBe(true);
  expect(stdoutProbe).not.toHaveBeenCalled();
  expect(stderrProbe).not.toHaveBeenCalled();

  expect(capabilities.stdout.colorDepth).toBe(24);
  expect(stdoutProbe).toHaveBeenCalledOnce();
  expect(stderrProbe).not.toHaveBeenCalled();
});

test("size probing stays behind the backend and refresh ignores live stream fields", () => {
  const stdout = createWritable();
  const probe = vi.fn(() => ({
    kind: "detected" as const,
    source: "controlling-tty" as const,
    size: { columns: 90, rows: 20 },
  }));
  const backend = new NodeTerminalBackend({
    stdin: createReadable(),
    stdout,
    stderr: createWritable(),
    sizeProbe: probe,
  });

  expect(backend.size).toEqual({ columns: 120, rows: 40 });
  expect(probe).not.toHaveBeenCalled();
  expect(backend.refreshSize()).toEqual({ columns: 90, rows: 20 });
  expect(probe).toHaveBeenCalledOnce();

  Object.assign(stdout, { columns: undefined, rows: undefined });
  expect(backend.size).toEqual({ columns: 90, rows: 20 });
  expect(probe).toHaveBeenCalledTimes(2);
});

test("structural writable callbacks settle on the next turn", async () => {
  const stdout = createWritable();
  const backend = new NodeTerminalBackend({
    stdin: createReadable(),
    stdout,
    stderr: createWritable(),
  });
  let completed = false;

  backend.write("stdout", "frame", () => {
    completed = true;
  });
  expect(completed).toBe(false);
  await new Promise<void>((resolve) => setImmediate(resolve));

  expect(completed).toBe(true);
});

test("input cleanup can retry when listener removal fails", () => {
  const stdin = createReadable();
  const originalOff = stdin.off.bind(stdin);
  let rejectFirstRemoval = true;
  Object.assign(stdin, {
    off(event: string | symbol, listener: (...args: unknown[]) => void) {
      if (event === "data" && rejectFirstRemoval) {
        rejectFirstRemoval = false;
        throw new Error("off failed before removal");
      }
      return originalOff(event, listener);
    },
  });
  const backend = new NodeTerminalBackend({
    stdin,
    stdout: createWritable(),
    stderr: createWritable(),
  });
  const stop = backend.onData(() => {});

  expect(() => stop()).toThrow("off failed before removal");
  expect(stdin.listenerCount("data")).toBe(1);
  expect(() => stop()).not.toThrow();
  expect(stdin.listenerCount("data")).toBe(0);
});

test("input cleanup can retry when restoring paused flow fails", () => {
  const stdin = createReadable();
  let rejectFirstPause = true;
  Object.assign(stdin, {
    readableFlowing: false,
    resume() {
      Object.assign(stdin, { readableFlowing: true });
      return stdin;
    },
    pause() {
      if (rejectFirstPause) {
        rejectFirstPause = false;
        throw new Error("pause failed");
      }
      Object.assign(stdin, { readableFlowing: false });
      return stdin;
    },
  });
  const backend = new NodeTerminalBackend({
    stdin,
    stdout: createWritable(),
    stderr: createWritable(),
  });
  const stop = backend.onData(() => {});

  expect(() => stop()).toThrow("pause failed");
  expect(stdin.listenerCount("data")).toBe(0);
  expect((stdin as { readableFlowing?: boolean }).readableFlowing).toBe(true);
  expect(() => stop()).not.toThrow();
  expect((stdin as { readableFlowing?: boolean }).readableFlowing).toBe(false);
});

test("duplicate input callbacks retain flow ownership until both registrations end", () => {
  const stdin = createReadable();
  Object.assign(stdin, {
    readableFlowing: false,
    resume() {
      Object.assign(stdin, { readableFlowing: true });
      return stdin;
    },
    pause() {
      Object.assign(stdin, { readableFlowing: false });
      return stdin;
    },
  });
  const backend = new NodeTerminalBackend({
    stdin,
    stdout: createWritable(),
    stderr: createWritable(),
  });
  const listener = (): void => {};
  const stopFirst = backend.onData(listener);
  const stopSecond = backend.onData(listener);

  stopFirst();
  expect((stdin as { readableFlowing?: boolean }).readableFlowing).toBe(true);
  stopSecond();

  expect(stdin.listenerCount("data")).toBe(0);
  expect((stdin as { readableFlowing?: boolean }).readableFlowing).toBe(false);
});

test("an external listener added during pause keeps input flowing", () => {
  const stdin = createReadable();
  const external = (): void => {};
  Object.assign(stdin, {
    readableFlowing: false,
    resume() {
      Object.assign(stdin, { readableFlowing: true });
      return stdin;
    },
    pause() {
      stdin.on("data", external);
      Object.assign(stdin, { readableFlowing: false });
      return stdin;
    },
  });
  const backend = new NodeTerminalBackend({
    stdin,
    stdout: createWritable(),
    stderr: createWritable(),
  });
  const stop = backend.onData(() => {});

  stop();

  expect(stdin.listenerCount("data")).toBe(1);
  expect((stdin as { readableFlowing?: boolean }).readableFlowing).toBe(true);
  stdin.off("data", external);
});

test("the node backend counts mode ownership like the test backend does", () => {
  const backend = new NodeTerminalBackend({
    stdin: createReadable(),
    stdout: createWritable(),
    stderr: createWritable(),
  });

  expect(backend.isModeHeld("alternate-screen")).toBe(false);
  const first = backend.acquire("alternate-screen");
  const second = backend.acquire("alternate-screen");
  expect(backend.isModeHeld("alternate-screen")).toBe(true);

  first.release();
  first.release();
  expect(backend.isModeHeld("alternate-screen")).toBe(true);

  second.release();
  expect(backend.isModeHeld("alternate-screen")).toBe(false);
});
