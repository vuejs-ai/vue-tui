import { defineComponent, shallowRef, nextTick } from "vue";
import { test as it, expect } from "vite-plus/test";
import ansiEscapes from "ansi-escapes";
import { createApp, Text } from "@vue-tui/runtime";
import { makeFakeWritable, makeFakeStdin, captureWrites } from "../lifecycle/test-streams.ts";

function makeFakeNonTtyWritable(rows = 6): NodeJS.WriteStream {
  const s = makeFakeWritable({ rows });
  (s as any).isTTY = false;
  return s;
}

it("#450: non-TTY full-height rerenders should never clear terminal", async () => {
  const stdout = makeFakeNonTtyWritable(6);
  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();
  const writes = captureWrites(stdout);

  const msg = shallowRef("line1\nline2\nline3\nline4\nline5\nline6");
  const App = defineComponent(() => () => <Text>{msg.value}</Text>);
  const app = createApp(App);

  app.mount({ stdout, stdin, stderr, exitOnCtrlC: false });
  await nextTick();
  await nextTick();

  msg.value = "line1\nline2\nline3\nline4\nline5\nLINE6";
  await nextTick();
  await nextTick();

  app.unmount();
  const clearCount = writes.filter((w) => w.includes(ansiEscapes.clearTerminal)).length;
  expect(clearCount).toBe(0);
});

it("#450: non-TTY overflow transitions should never clear terminal", async () => {
  const stdout = makeFakeNonTtyWritable(6);
  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();
  const writes = captureWrites(stdout);

  const msg = shallowRef("line1\nline2\nline3");
  const App = defineComponent(() => () => <Text>{msg.value}</Text>);
  const app = createApp(App);

  app.mount({ stdout, stdin, stderr, exitOnCtrlC: false });
  await nextTick();
  await nextTick();

  msg.value = "line1\nline2\nline3\nline4\nline5\nline6\nline7";
  await nextTick();
  await nextTick();

  app.unmount();
  const clearCount = writes.filter((w) => w.includes(ansiEscapes.clearTerminal)).length;
  expect(clearCount).toBe(0);
});

it("#450: viewport shrink into overflow clears exactly once on resize", async () => {
  const stdout = makeFakeWritable({ rows: 10 });
  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();
  const writes = captureWrites(stdout);

  const msg = shallowRef("line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8");
  const App = defineComponent(() => () => <Text>{msg.value}</Text>);
  const app = createApp(App);

  app.mount({ stdout, stdin, stderr, exitOnCtrlC: false });
  await nextTick();
  await nextTick();
  const clearsBeforeResize = writes.filter((w) => w.includes(ansiEscapes.clearTerminal)).length;
  expect(clearsBeforeResize).toBe(0); // 8 lines fit in 10 rows — no clear yet

  // Shrink so the content overflows the viewport. The resize renders
  // synchronously (matching Ink), so the overflow clear is emitted right here,
  // not deferred through the commit throttle.
  stdout.rows = 4;
  stdout.emit("resize");
  await nextTick();

  const clearsAfterResize = writes.filter((w) => w.includes(ansiEscapes.clearTerminal)).length;
  expect(clearsAfterResize - clearsBeforeResize).toBe(1);

  app.unmount();
});

it("#450: non-TTY grow-to-overflow rerender should not clear terminal", async () => {
  const { spawn } = await import("node:child_process");
  const fixturePath = new URL("./fixtures/issue-450-grow-to-overflow-rerender.tsx", import.meta.url)
    .pathname;

  const output = await new Promise<string>((resolve, reject) => {
    let stdout = "";
    let stderr = "";

    const child = spawn("node", ["--import=tsx", fixturePath, "3"], {
      cwd: new URL("./fixtures", import.meta.url).pathname,
      env: {
        ...process.env,
        NODE_NO_WARNINGS: "1",
        CI: "false",
        FORCE_COLOR: "3",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`Fixture exited with code ${code}: ${stderr}`));
      }
    });

    setTimeout(() => {
      child.kill();
      reject(new Error("Fixture timed out"));
    }, 10000);
  });

  const clearCount = output.split(ansiEscapes.clearTerminal).length - 1;
  expect(clearCount).toBe(0);
});
