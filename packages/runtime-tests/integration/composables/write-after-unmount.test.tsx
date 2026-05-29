/**
 * G20 — writeToStdout/writeToStderr must no-op after teardown (Ink parity).
 *
 * Ink ink.tsx:673/702 returns early when the instance is unmounted so that a
 * write after teardown cannot run clear()/write/restore on an already-torn-down
 * renderer and corrupt the terminal.  vue-tui must mirror that guard.
 */
import { PassThrough } from "node:stream";
import { defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import { createApp, Text, useStdout, useStderr } from "@vue-tui/runtime";

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

test("writeToStdout: pre-unmount write works, post-unmount write is suppressed", async () => {
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

  // Wait for initial render to settle
  await new Promise<void>((r) => setTimeout(r, 60));

  // Control: a write BEFORE unmount should produce output
  stdout.chunks.length = 0;
  writeRef!("before-unmount\n");
  const beforeChunks = stdout.chunks.join("");
  expect(beforeChunks, "pre-unmount write must produce output").toContain("before-unmount");

  // Now unmount (triggers teardown)
  app.unmount();

  // Clear captured chunks and attempt a write AFTER unmount
  stdout.chunks.length = 0;
  writeRef!("after-unmount\n");
  const afterChunks = stdout.chunks.join("");

  // The guard must prevent any write to stdout after teardown
  expect(
    afterChunks,
    `post-unmount write must be suppressed; got: ${JSON.stringify(afterChunks)}`,
  ).not.toContain("after-unmount");
});

test("writeToStderr: pre-unmount write works, post-unmount write is suppressed", async () => {
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

  // Wait for initial render to settle
  await new Promise<void>((r) => setTimeout(r, 60));

  // Control: a write BEFORE unmount should produce output on stderr
  stderr.chunks.length = 0;
  writeRef!("before-unmount-err\n");
  const beforeChunks = stderr.chunks.join("");
  expect(beforeChunks, "pre-unmount stderr write must produce output").toContain(
    "before-unmount-err",
  );

  // Now unmount (triggers teardown)
  app.unmount();

  // Clear captured chunks and attempt a write AFTER unmount
  stderr.chunks.length = 0;
  writeRef!("after-unmount-err\n");
  const afterChunks = stderr.chunks.join("");

  // The guard must prevent any write to stderr after teardown
  expect(
    afterChunks,
    `post-unmount stderr write must be suppressed; got: ${JSON.stringify(afterChunks)}`,
  ).not.toContain("after-unmount-err");
});
