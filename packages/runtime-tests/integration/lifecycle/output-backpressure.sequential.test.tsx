import { Writable } from "node:stream";
import ansiEscapes from "ansi-escapes";
import { defineComponent, h, nextTick, shallowRef } from "vue";
import { expect, test } from "vite-plus/test";
import {
  Box,
  createApp,
  Text,
  useInput,
  useStdout,
  type CoordinatedWriteResult,
  type TuiInputEvent,
} from "@vue-tui/runtime";
import { Static } from "@vue-tui/runtime/inline";
import {
  INTERNAL_KITTY_KEYBOARD,
  runtimeResourceTracker,
  type InternalMountOptions,
} from "@vue-tui/runtime/internal";
import { bsu, esu } from "../../../runtime/src/io/write-synchronized.ts";
import { createSlowWritable } from "./slow-writable.ts";
import { makeFakeStdin, makeFakeWritable } from "./test-streams.ts";

const PASTE_ON = "\x1b[?2004h";
const PASTE_OFF = "\x1b[?2004l";

function inputLabel(event: TuiInputEvent): string {
  if (event.kind === "text" || event.kind === "paste") return event.text;
  return event.name ?? event.character;
}

function makeTrackedStdin(): {
  readonly stream: NodeJS.ReadStream;
  readonly rawCalls: readonly boolean[];
  readonly isRaw: () => boolean;
} {
  const { stream } = makeFakeStdin();
  const rawCalls: boolean[] = [];
  let raw = false;
  Object.assign(stream, {
    isRaw: false,
    setRawMode(this: NodeJS.ReadStream & { isRaw: boolean }, mode: boolean) {
      raw = mode;
      this.isRaw = mode;
      rawCalls.push(mode);
      return this;
    },
  });
  return { stream, rawCalls, isRaw: () => raw };
}

async function flushInputTurn(): Promise<void> {
  await nextTick();
  await Promise.resolve();
  await new Promise<void>((resolve) => setImmediate(resolve));
}

test.sequential("an Inline transaction never writes again between write(false) and drain", async () => {
  const history = Object.freeze({ id: "history-0", text: "H".repeat(2_048) });
  const Root = defineComponent(
    () => () =>
      h(Box, { flexDirection: "column" }, () => [
        h(Static, null, () => h(Text, null, () => `${history.id}:${history.text}`)),
        h(Text, null, () => "latest-live-frame"),
      ]),
  );
  const slow = createSlowWritable();
  const { stream: stdin } = makeFakeStdin();
  const app = createApp(Root);

  app.mount({
    stdin,
    stdout: slow.stream,
    stderr: makeFakeWritable(),
    liveUpdates: true,
    maxFps: 0,
    patchConsole: false,
  });
  await new Promise((resolve) => setTimeout(resolve, 350));
  app.unmount();
  await slow.waitForIdle();

  expect(slow.falseAttempts.length).toBeGreaterThan(0);
  expect(slow.writesBeforeDrain).toEqual([]);
  expect(slow.maxWritableLength - 256).toBeLessThanOrEqual(slow.largestAtomicWrite);
}, 10_000);

test.sequential("coordinated writes distinguish accepted backpressure from non-acceptance", async () => {
  let write!: (data: string) => CoordinatedWriteResult;
  const Root = defineComponent(() => {
    write = useStdout().write;
    return () => null;
  });
  const slow = createSlowWritable();
  const { stream: stdin } = makeFakeStdin();
  const app = createApp(Root);
  app.mount({
    stdin,
    stdout: slow.stream,
    stderr: makeFakeWritable(),
    liveUpdates: true,
    maxFps: 0,
    patchConsole: false,
  });

  const first = write(`accepted:${"A".repeat(2_048)}\n`);
  const second = write("must-not-be-retained\n");

  expect(first).toMatchObject({ status: "accepted", writable: false });
  expect(second.status).toBe("blocked");
  if (first.status !== "accepted" || first.writable) {
    throw new Error("expected accepted backpressure");
  }
  await first.ready;
  expect(slow.deliveredOutput).toContain("accepted:");
  expect(slow.deliveredOutput).not.toContain("must-not-be-retained");

  app.unmount();
  await app.waitUntilExit();
  await slow.waitForIdle();
  expect(slow.writesBeforeDrain).toEqual([]);
}, 10_000);

test.sequential("synchronized-output ownership follows physical BSU and ESU handoff", async () => {
  const writes: string[] = [];
  let releaseFirstWrite!: () => void;
  let firstWrite = true;
  const stdout = new Writable({
    highWaterMark: 1,
    write(chunk: Buffer, _encoding, callback) {
      writes.push(chunk.toString());
      if (firstWrite) {
        firstWrite = false;
        releaseFirstWrite = callback;
        return;
      }
      callback();
    },
  }) as unknown as NodeJS.WriteStream;
  Object.assign(stdout, { columns: 80, rows: 24, isTTY: true });
  const { stream: stdin } = makeFakeStdin();
  let write!: (data: string) => CoordinatedWriteResult;
  const app = createApp(
    defineComponent(() => {
      write = useStdout().write;
      return () => null;
    }),
  );
  const before = runtimeResourceTracker.snapshot().synchronizedOutputLeases;

  app.mount({
    stdin,
    stdout,
    stderr: makeFakeWritable(),
    liveUpdates: true,
    maxFps: 0,
    patchConsole: false,
  });
  const result = write("physical-lease\n");

  expect(result).toMatchObject({ status: "accepted", writable: false });
  expect(writes).toEqual([bsu]);
  expect(runtimeResourceTracker.snapshot().synchronizedOutputLeases).toBe(before + 1);

  releaseFirstWrite();
  if (result.status !== "accepted" || result.writable) {
    throw new Error("expected synchronized output to be backpressured");
  }
  await result.ready;
  expect(writes.join("")).toContain("physical-lease\n");
  expect(writes.join("")).toContain(esu);
  expect(runtimeResourceTracker.snapshot().synchronizedOutputLeases).toBe(before);

  app.unmount();
  await app.waitUntilExit();
}, 10_000);

test.sequential("normal unmount waits for drain before final output and restoration", async () => {
  let write!: (data: string) => CoordinatedWriteResult;
  const Root = defineComponent(() => {
    write = useStdout().write;
    return () => h(Text, null, () => "live");
  });
  const slow = createSlowWritable();
  const { stream: stdin } = makeFakeStdin();
  const app = createApp(Root);
  app.mount({
    stdin,
    stdout: slow.stream,
    stderr: makeFakeWritable(),
    liveUpdates: true,
    maxFps: 0,
    patchConsole: false,
  });

  const writeResult = write(`record:${"R".repeat(2_048)}\n`);
  expect(writeResult).toMatchObject({ status: "accepted", writable: false });
  let settled = false;
  app.unmount();
  const exit = app.waitUntilExit().then(() => {
    settled = true;
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(settled).toBe(false);

  await exit;
  await slow.waitForIdle();
  expect(slow.writesBeforeDrain).toEqual([]);
  expect(slow.deliveredOutput).toContain("record:");
  expect(slow.deliveredOutput).toContain("\x1b[?25h");
}, 10_000);

test.sequential("Fullscreen managed input waits through initial output backpressure without losing its route", async () => {
  const before = runtimeResourceTracker.snapshot();
  const inputs: string[] = [];
  const Root = defineComponent(() => {
    useInput((event) => {
      inputs.push(inputLabel(event));
    });
    return () => h(Text, null, () => "ready");
  });
  const slow = createSlowWritable({
    highWaterMark: 1,
    firstDelayMs: 20,
    laterDelayMs: 2,
  });
  const { stream: stdin, rawCalls, isRaw } = makeTrackedStdin();
  const stderr = makeFakeWritable();
  const app = createApp(Root);

  app.mount({
    stdin,
    stdout: slow.stream,
    stderr,
    mode: "fullscreen",
    liveUpdates: true,
    [INTERNAL_KITTY_KEYBOARD]: { mode: "disabled" },
    maxFps: 0,
    patchConsole: false,
  } as InternalMountOptions);
  stdin.emit("data", "early");
  await app.waitUntilRenderFlush();
  await flushInputTurn();

  const output = slow.deliveredOutput;
  expect(output.indexOf(ansiEscapes.enterAlternativeScreen)).toBeGreaterThanOrEqual(0);
  expect(output.indexOf("\x1b[?25l")).toBeGreaterThan(
    output.indexOf(ansiEscapes.enterAlternativeScreen),
  );
  expect(output.indexOf(PASTE_ON)).toBeGreaterThan(output.indexOf("\x1b[?25l"));
  expect(inputs).toEqual([]);
  expect(isRaw()).toBe(true);

  stdin.emit("data", "late");
  await flushInputTurn();
  expect(inputs).toEqual(["late"]);

  app.unmount();
  await app.waitUntilExit();
  await slow.waitForIdle();
  expect(rawCalls.at(-1)).toBe(false);
  expect(slow.writesBeforeDrain).toEqual([]);
  expect(runtimeResourceTracker.snapshot()).toEqual(before);
  stdin.destroy();
  slow.stream.destroy();
  stderr.destroy();
}, 10_000);

test.sequential("Inline Kitty and paste activation reconcile one handed control write at a time", async () => {
  const inputs: string[] = [];
  const Root = defineComponent(() => {
    useInput((event) => {
      inputs.push(inputLabel(event));
    });
    return () => h(Text, null, () => "kitty-ready");
  });
  const slow = createSlowWritable({
    highWaterMark: 1,
    firstDelayMs: 20,
    laterDelayMs: 2,
  });
  const { stream: stdin } = makeTrackedStdin();
  const stderr = makeFakeWritable();
  const app = createApp(Root);

  app.mount({
    stdin,
    stdout: slow.stream,
    stderr,
    liveUpdates: true,
    [INTERNAL_KITTY_KEYBOARD]: { mode: "enabled" },
    maxFps: 0,
    patchConsole: false,
  } as InternalMountOptions);
  stdin.emit("data", "early");
  await app.waitUntilRenderFlush();
  await flushInputTurn();

  const output = slow.deliveredOutput;
  expect(output.indexOf("\x1b[>1u")).toBeGreaterThanOrEqual(0);
  expect(output.indexOf(PASTE_ON)).toBeGreaterThan(output.indexOf("\x1b[>1u"));
  expect(inputs).toEqual([]);

  stdin.emit("data", "k");
  await flushInputTurn();
  expect(inputs).toEqual(["k"]);
  expect(slow.writesBeforeDrain).toEqual([]);

  app.unmount();
  await app.waitUntilExit();
  await slow.waitForIdle();
  stdin.destroy();
  slow.stream.destroy();
  stderr.destroy();
}, 10_000);

test.sequential("a semantic-input release during public output backpressure restores paste after drain", async () => {
  const active = shallowRef(true);
  let write!: (data: string) => CoordinatedWriteResult;
  const Root = defineComponent(() => {
    write = useStdout().write;
    useInput(() => {}, { isActive: active });
    return () => h(Text, null, () => "active");
  });
  const slow = createSlowWritable({
    highWaterMark: 1,
    firstDelayMs: 10,
    laterDelayMs: 20,
  });
  const { stream: stdin, isRaw } = makeTrackedStdin();
  const stderr = makeFakeWritable();
  const app = createApp(Root);
  app.mount({
    stdin,
    stdout: slow.stream,
    stderr,
    liveUpdates: true,
    [INTERNAL_KITTY_KEYBOARD]: { mode: "disabled" },
    maxFps: 0,
    patchConsole: false,
  } as InternalMountOptions);
  await app.waitUntilRenderFlush();

  const result = write("block-release\n");
  expect(result).toMatchObject({ status: "accepted", writable: false });
  active.value = false;
  await flushInputTurn();
  expect(isRaw()).toBe(false);
  expect(slow.attempts.filter(({ chunk }) => chunk.includes(PASTE_OFF))).toHaveLength(0);

  if (result.status !== "accepted" || result.writable) {
    throw new Error("expected accepted public-output backpressure");
  }
  await result.ready;
  await app.waitUntilRenderFlush();
  expect(slow.deliveredOutput).toContain(PASTE_OFF);
  expect(slow.writesBeforeDrain).toEqual([]);

  app.unmount();
  await app.waitUntilExit();
  await slow.waitForIdle();
  stdin.destroy();
  slow.stream.destroy();
  stderr.destroy();
}, 10_000);

test.sequential("blocked semantic-input changes retain only the final active state", async () => {
  const active = shallowRef(true);
  const inputs: string[] = [];
  let write!: (data: string) => CoordinatedWriteResult;
  const Root = defineComponent(() => {
    write = useStdout().write;
    useInput(
      (event) => {
        inputs.push(inputLabel(event));
      },
      { isActive: active },
    );
    return () => h(Text, null, () => "latest");
  });
  const slow = createSlowWritable({
    highWaterMark: 1,
    firstDelayMs: 10,
    laterDelayMs: 20,
  });
  const { stream: stdin, isRaw } = makeTrackedStdin();
  const stderr = makeFakeWritable();
  const app = createApp(Root);
  app.mount({
    stdin,
    stdout: slow.stream,
    stderr,
    liveUpdates: true,
    [INTERNAL_KITTY_KEYBOARD]: { mode: "disabled" },
    maxFps: 0,
    patchConsole: false,
  } as InternalMountOptions);
  await app.waitUntilRenderFlush();

  const baselineOn = slow.deliveredOutput.split(PASTE_ON).length - 1;
  const result = write("block-toggle\n");
  active.value = false;
  await flushInputTurn();
  active.value = true;
  await flushInputTurn();
  if (result.status !== "accepted" || result.writable) {
    throw new Error("expected accepted public-output backpressure");
  }
  await result.ready;
  await app.waitUntilRenderFlush();

  expect(isRaw()).toBe(true);
  expect(slow.deliveredOutput.split(PASTE_ON).length - 1).toBe(baselineOn);
  expect(slow.deliveredOutput).not.toContain(PASTE_OFF);
  stdin.emit("data", "z");
  await flushInputTurn();
  expect(inputs).toEqual(["z"]);
  expect(slow.writesBeforeDrain).toEqual([]);

  app.unmount();
  await app.waitUntilExit();
  await slow.waitForIdle();
  stdin.destroy();
  slow.stream.destroy();
  stderr.destroy();
}, 10_000);
