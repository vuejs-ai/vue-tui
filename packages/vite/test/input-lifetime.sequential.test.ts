// SEQUENTIAL: mutates a dedicated fixture plus process-global stdin/stdout and
// lifecycle probes. The package test config runs dev-server files serially so
// no other Vite runner can observe these globals or edit this fixture at once.
import { afterEach, expect, test } from "vite-plus/test";
import { readFileSync, writeFileSync } from "node:fs";
import { PassThrough } from "node:stream";
import { fileURLToPath } from "node:url";
import vue from "@vitejs/plugin-vue";
import { createServer, type ViteDevServer } from "vite";
import { vueTui } from "../src/index.ts";
import { waitFor, waitUntil } from "./helpers.ts";

const root = fileURLToPath(new URL("./fixtures/input-hmr", import.meta.url));
const appVue = fileURLToPath(new URL("./fixtures/input-hmr/src/app.vue", import.meta.url));
const mainTs = fileURLToPath(new URL("./fixtures/input-hmr/src/main.ts", import.meta.url));
const origAppVue = readFileSync(appVue, "utf8");
const origMainTs = readFileSync(mainTs, "utf8");
let server: ViteDevServer | undefined;

interface TestGlobal {
  __VT_INPUT_ACTIVE_MOUNT__?: number;
  __VT_INPUT_CALLS__?: string[];
  __VT_INPUT_MOUNTS__?: number;
  __VT_INPUT_SETUPS__?: string[];
  __VT_INPUT_START__?: () => void;
  __VT_INPUT_STOP__?: () => void;
  __VT_TEST_APP__?: { unmount(): void };
  __VT_TEST_STDIN__?: NodeJS.ReadStream;
  __VT_TEST_STDOUT__?: NodeJS.WriteStream;
}

function testGlobal(): TestGlobal {
  return globalThis as TestGlobal;
}

function createTrackedStdin(): {
  stdin: NodeJS.ReadStream;
  rawModeCalls: boolean[];
  refBalance: () => number;
  trace: string[];
} {
  const stdin = new PassThrough() as unknown as NodeJS.ReadStream & { isRaw: boolean };
  const rawModeCalls: boolean[] = [];
  const trace: string[] = [];
  let refs = 0;
  const on = stdin.on.bind(stdin);
  const off = stdin.off.bind(stdin);
  Object.assign(stdin, {
    isTTY: true,
    isRaw: false,
    setRawMode(this: NodeJS.ReadStream & { isRaw: boolean }, mode: boolean) {
      rawModeCalls.push(mode);
      trace.push(`raw:${mode}`);
      this.isRaw = mode;
      return this;
    },
    ref() {
      refs++;
      trace.push("ref");
      return stdin;
    },
    unref() {
      refs--;
      trace.push("unref");
      return stdin;
    },
    on(event: string | symbol, listener: (...args: unknown[]) => void) {
      if (event === "data") trace.push("data:on");
      return on(event, listener);
    },
    off(event: string | symbol, listener: (...args: unknown[]) => void) {
      if (event === "data") trace.push("data:off");
      return off(event, listener);
    },
  });
  return { stdin, rawModeCalls, refBalance: () => refs, trace };
}

function createTrackedStdout(trace: string[]): {
  stdout: NodeJS.WriteStream;
  read: () => string;
} {
  let output = "";
  const stdout = new PassThrough() as unknown as NodeJS.WriteStream;
  Object.assign(stdout, { isTTY: true, columns: 80, rows: 24 });
  stdout.on("data", (chunk) => {
    const text = String(chunk);
    output += text;
    if (text.includes("\x1b[>1u")) trace.push("kitty:push");
    if (text.includes("\x1b[<u")) trace.push("kitty:pop");
    if (text.includes("\x1b[?2004h")) trace.push("paste:on");
    if (text.includes("\x1b[?2004l")) trace.push("paste:off");
  });
  return { stdout, read: () => output };
}

function inputState(
  stdin: NodeJS.ReadStream,
  rawModeCalls: readonly boolean[],
  refBalance: () => number,
) {
  return {
    rawModeCalls: [...rawModeCalls],
    refs: refBalance(),
    listeners: stdin.listenerCount("data"),
  };
}

async function emitAndWait(
  stdin: NodeJS.ReadStream,
  sequence: string,
  expected: string[],
): Promise<void> {
  stdin.emit("data", sequence);
  await waitUntil(
    () => JSON.stringify(testGlobal().__VT_INPUT_CALLS__) === JSON.stringify(expected),
  );
}

afterEach(async () => {
  testGlobal().__VT_TEST_APP__?.unmount();
  await server?.close().catch(() => {});
  server = undefined;
  writeFileSync(appVue, origAppVue);
  writeFileSync(mainTs, origMainTs);
  delete testGlobal().__VT_INPUT_ACTIVE_MOUNT__;
  delete testGlobal().__VT_INPUT_CALLS__;
  delete testGlobal().__VT_INPUT_MOUNTS__;
  delete testGlobal().__VT_INPUT_SETUPS__;
  delete testGlobal().__VT_INPUT_START__;
  delete testGlobal().__VT_INPUT_STOP__;
  delete testGlobal().__VT_TEST_APP__;
  delete testGlobal().__VT_TEST_STDIN__;
  delete testGlobal().__VT_TEST_STDOUT__;
});

test("public global and focused input survive template, script, and full HMR lifetimes", async () => {
  const { stdin, rawModeCalls, refBalance, trace } = createTrackedStdin();
  const { stdout, read } = createTrackedStdout(trace);
  Object.assign(testGlobal(), {
    __VT_INPUT_CALLS__: [],
    __VT_INPUT_MOUNTS__: 0,
    __VT_INPUT_SETUPS__: [],
    __VT_TEST_STDIN__: stdin,
    __VT_TEST_STDOUT__: stdout,
  });
  server = await createServer({
    root,
    logLevel: "silent",
    configFile: false,
    plugins: [vue(), vueTui()],
    ssr: { external: ["@vue-tui/runtime", "@vue-tui/runtime/internal"] },
  });
  await server.listen();
  await waitFor(read, "INPUT-LABEL-A generation=1:A");
  await waitUntil(() => testGlobal().__VT_INPUT_SETUPS__?.length === 1);

  expect(inputState(stdin, rawModeCalls, refBalance)).toEqual({
    rawModeCalls: [true],
    refs: 1,
    listeners: 1,
  });
  expect(testGlobal().__VT_INPUT_MOUNTS__).toBe(1);
  expect(testGlobal().__VT_INPUT_SETUPS__).toEqual(["1:A"]);
  await emitAndWait(stdin, "x", ["1:A:global:x", "1:A:focus:x"]);

  const templateTraceStart = trace.length;
  const templateHot = origAppVue.replace("INPUT-LABEL-A", "INPUT-LABEL-B-HOT");
  writeFileSync(appVue, templateHot);
  await waitFor(read, "INPUT-LABEL-B-HOT generation=1:A");
  expect(testGlobal().__VT_INPUT_SETUPS__).toEqual(["1:A"]);
  expect(trace.slice(templateTraceStart)).toEqual([]);
  expect(inputState(stdin, rawModeCalls, refBalance)).toEqual({
    rawModeCalls: [true],
    refs: 1,
    listeners: 1,
  });
  await emitAndWait(stdin, "y", ["1:A:global:x", "1:A:focus:x", "1:A:global:y", "1:A:focus:y"]);

  const scriptTraceStart = trace.length;
  const scriptHot = templateHot.replace('const generation = "A";', 'const generation = "B";');
  writeFileSync(appVue, scriptHot);
  await waitFor(read, "INPUT-LABEL-B-HOT generation=1:B");
  await waitUntil(() => testGlobal().__VT_INPUT_SETUPS__?.length === 2);
  expect(testGlobal().__VT_INPUT_SETUPS__).toEqual(["1:A", "1:B"]);
  expect(trace.slice(scriptTraceStart)).toEqual([]);
  expect(inputState(stdin, rawModeCalls, refBalance)).toEqual({
    rawModeCalls: [true],
    refs: 1,
    listeners: 1,
  });
  await emitAndWait(stdin, "z", [
    "1:A:global:x",
    "1:A:focus:x",
    "1:A:global:y",
    "1:A:focus:y",
    "1:B:global:z",
    "1:B:focus:z",
  ]);

  // Stable physical state alone cannot reveal an old logical-demand leak. End
  // only the replacement route: every physical owner must disappear. Starting
  // it again then prepares an active controller for the full-reload boundary.
  testGlobal().__VT_INPUT_STOP__!();
  await waitUntil(
    () => rawModeCalls.at(-1) === false && refBalance() === 0 && stdin.listenerCount("data") === 0,
  );
  testGlobal().__VT_INPUT_START__!();
  await waitUntil(
    () => rawModeCalls.at(-1) === true && refBalance() === 1 && stdin.listenerCount("data") === 1,
  );

  const reloadTraceStart = trace.length;
  writeFileSync(mainTs, `${origMainTs}\n// input-full-reload\n`);
  await waitUntil(
    () =>
      testGlobal().__VT_INPUT_MOUNTS__ === 2 &&
      testGlobal().__VT_INPUT_SETUPS__?.length === 3 &&
      stdin.listenerCount("data") === 1,
  );
  expect(testGlobal().__VT_INPUT_SETUPS__).toEqual(["1:A", "1:B", "2:B"]);
  expect(inputState(stdin, rawModeCalls, refBalance)).toEqual({
    rawModeCalls: [true, false, true, false, true],
    refs: 1,
    listeners: 1,
  });
  const reloadTrace = trace.slice(reloadTraceStart);
  const releases = ["paste:off", "kitty:pop", "data:off", "raw:false", "unref"];
  const acquisitions = ["kitty:push", "raw:true", "ref", "data:on", "paste:on"];
  for (const event of [...releases, ...acquisitions]) {
    expect(reloadTrace.filter((entry) => entry === event)).toHaveLength(1);
  }
  expect(Math.max(...releases.map((event) => reloadTrace.indexOf(event)))).toBeLessThan(
    Math.min(...acquisitions.map((event) => reloadTrace.indexOf(event))),
  );
  await emitAndWait(stdin, "q", [
    "1:A:global:x",
    "1:A:focus:x",
    "1:A:global:y",
    "1:A:focus:y",
    "1:B:global:z",
    "1:B:focus:z",
    "2:B:global:q",
    "2:B:focus:q",
  ]);

  testGlobal().__VT_TEST_APP__!.unmount();
  await waitUntil(() => stdin.listenerCount("data") === 0 && refBalance() === 0);
  expect(inputState(stdin, rawModeCalls, refBalance)).toEqual({
    rawModeCalls: [true, false, true, false, true, false],
    refs: 0,
    listeners: 0,
  });
}, 30000);
