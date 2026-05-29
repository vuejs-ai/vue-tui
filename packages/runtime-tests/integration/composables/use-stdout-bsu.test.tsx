/**
 * Tests that writeToStdout / writeToStderr wrap external writes in
 * synchronized-update markers (BSU/ESU) when the stream is a TTY and the
 * runtime is in interactive mode — Ink parity G09.
 *
 * We use createApp with debug:false and a fake TTY stream so the interactive
 * path is exercised.  The test config forces CI:"false" so isInCi() returns
 * false and shouldSynchronize() returns true.
 */
import { PassThrough } from "node:stream";
import { defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import { createApp, Text, useStdout, useStderr } from "@vue-tui/runtime";

const BSU = "\x1b[?2026h";
const ESU = "\x1b[?2026l";

function makeTtyStream(): NodeJS.WriteStream & { chunks: string[] } {
  const s = new PassThrough() as unknown as NodeJS.WriteStream & { chunks: string[] };
  Object.assign(s, { columns: 80, rows: 24, isTTY: true, chunks: [] as string[] });
  s.on("data", (chunk: Buffer) => s.chunks.push(chunk.toString()));
  return s;
}

function makeFakeStdin(): NodeJS.ReadStream {
  const s = new PassThrough() as unknown as NodeJS.ReadStream;
  Object.assign(s, {
    isTTY: true,
    setRawMode() {
      return s;
    },
    setEncoding() {
      return s;
    },
  });
  (s as any).ref = () => {};
  (s as any).unref = () => {};
  return s;
}

test("writeToStdout wraps external write in BSU/ESU on TTY interactive stream", async () => {
  const stdout = makeTtyStream();
  const stderr = makeTtyStream();
  const stdin = makeFakeStdin();

  let writeRef: ((data: string) => void) | undefined;

  const App = defineComponent(() => {
    const { write } = useStdout();
    writeRef = write;
    return () => <Text>frame</Text>;
  });

  const app = createApp(App);
  app.mount({ stdout, stdin, stderr, debug: false, exitOnCtrlC: false });

  // Let the initial render settle
  await new Promise<void>((r) => setTimeout(r, 60));

  // Clear captured output from initial render
  stdout.chunks.length = 0;

  // Trigger an external write through useStdout().write()
  writeRef!("external-data\n");

  // Collect everything written during this external-write call
  const output = stdout.chunks.join("");

  const bsuIdx = output.indexOf(BSU);
  const dataIdx = output.indexOf("external-data");
  const esuIdx = output.indexOf(ESU);

  // BSU must appear before the data, and ESU must appear after BSU
  expect(
    bsuIdx,
    `BSU (\\x1b[?2026h) must be present. Got: ${JSON.stringify(output)}`,
  ).toBeGreaterThanOrEqual(0);
  expect(
    dataIdx,
    `external-data must be in output. Got: ${JSON.stringify(output)}`,
  ).toBeGreaterThanOrEqual(0);
  expect(
    esuIdx,
    `ESU (\\x1b[?2026l) must be present. Got: ${JSON.stringify(output)}`,
  ).toBeGreaterThanOrEqual(0);
  expect(bsuIdx).toBeLessThan(dataIdx);
  expect(dataIdx).toBeLessThan(esuIdx);

  app.unmount();
});

test("writeToStderr wraps external write in BSU/ESU on stdout (Ink parity: stderr gates on stdout TTY)", async () => {
  const stdout = makeTtyStream();
  const stderr = makeTtyStream();
  const stdin = makeFakeStdin();

  let writeRef: ((data: string) => void) | undefined;

  const App = defineComponent(() => {
    const { write } = useStderr();
    writeRef = write;
    return () => <Text>frame</Text>;
  });

  const app = createApp(App);
  app.mount({ stdout, stdin, stderr, debug: false, exitOnCtrlC: false });

  // Let the initial render settle
  await new Promise<void>((r) => setTimeout(r, 60));

  // Clear captured output from initial render
  stdout.chunks.length = 0;
  stderr.chunks.length = 0;

  // Record the cross-stream write order synchronously (writes are sync calls):
  // BSU/ESU go to stdout, the data goes to stderr, so a per-stream string can't
  // prove the interleaving. Tag each relevant write into one shared timeline.
  const timeline: string[] = [];
  const origStdoutWrite = stdout.write.bind(stdout);
  const origStderrWrite = stderr.write.bind(stderr);
  (stdout as { write: (d: unknown, ...a: unknown[]) => unknown }).write = (d, ...a) => {
    const s = String(d);
    if (s.includes(BSU)) timeline.push("BSU");
    if (s.includes(ESU)) timeline.push("ESU");
    return (origStdoutWrite as (d: unknown, ...a: unknown[]) => unknown)(d, ...a);
  };
  (stderr as { write: (d: unknown, ...a: unknown[]) => unknown }).write = (d, ...a) => {
    if (String(d).includes("external-err")) timeline.push("DATA");
    return (origStderrWrite as (d: unknown, ...a: unknown[]) => unknown)(d, ...a);
  };

  // Trigger an external write through useStderr().write()
  writeRef!("external-err\n");

  // Per Ink ink.tsx:717-728: bsu/esu are written to STDOUT (not stderr) and the
  // data goes to stderr, as one atomic synchronized update. The interleaved
  // order across both streams must be BSU → stderr data → ESU.
  expect(
    timeline,
    `expected synchronized order BSU(stdout) → DATA(stderr) → ESU(stdout); got ${JSON.stringify(timeline)}`,
  ).toEqual(["BSU", "DATA", "ESU"]);

  app.unmount();
});
