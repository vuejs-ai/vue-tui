/**
 * G14 – per-stdout instance-reuse guard (Ink parity).
 *
 * Mirrors Ink's WeakMap<WriteStream, Ink> / getInstance() contract:
 * mounting a second vue-tui app on a stdout that already has a live (not-yet-
 * unmounted) instance should warn on process.stderr and NOT wire a second
 * renderer. After the first app unmounts, mounting on the same stdout again
 * must work normally.
 */

import { defineComponent } from "vue";
import { expect, test, vi, afterEach } from "vite-plus/test";
import { createApp, Text } from "@vue-tui/runtime";
import { makeFakeWritable, makeFakeStdin } from "./test-streams.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

test("warn + skip wiring when mount() is called on an already-live stdout", async () => {
  const App = defineComponent(() => () => <Text>hello</Text>);

  const stdout = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();
  // Use a separate fake stderr so we can observe writes to it without
  // interfering with real process.stderr.
  const stderrWrites: string[] = [];
  const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    stderrWrites.push(typeof chunk === "string" ? chunk : String(chunk));
    return true;
  });

  // ---- First app: mounts normally ----
  const app1 = createApp(App);
  app1.mount({ stdout, stdin, stderr: process.stderr, interactive: false });

  // ---- Second app: same stdout → warn + no-op ----
  const app2 = createApp(App);
  // Intercept stdout writes after the second mount to verify the second app
  // does NOT fire an initial renderer commit on the shared stream.
  const originalWrite = stdout.write.bind(stdout);
  let writeCountAfterSecondMount = 0;
  stdout.write = ((...args: unknown[]) => {
    writeCountAfterSecondMount++;
    return (originalWrite as Function)(...args);
  }) as NodeJS.WriteStream["write"];

  app2.mount({ stdout, stdin, stderr: process.stderr, interactive: false });

  // (a) A warning containing the key phrase was written to process.stderr.
  stderrSpy.mockRestore();
  expect(stderrWrites.join("")).toContain(
    "createApp()/mount() was called again for the same stdout before the previous Vue TUI instance was unmounted",
  );

  // (b) The second mount did NOT wire a second renderer: no additional writes
  // to stdout happened immediately after the second mount (the second app
  // performed no initial render commit on the shared stream).
  // Give a tick for any async renders to fire.
  await new Promise<void>((r) => setImmediate(r));
  expect(writeCountAfterSecondMount).toBe(0);

  // (c) app2.unmount() must NOT write anything to any stream (fake stdout OR
  // real process.stdout). Before the fix, resolveExit() fell back to
  // process.stdout and wrote an empty write-barrier chunk ("") when
  // mountedAppContext was null — spy on both streams to catch that.
  let writesFromApp2Unmount = 0;
  const savedWrite = stdout.write.bind(stdout);
  stdout.write = ((...args: unknown[]) => {
    writesFromApp2Unmount++;
    return (savedWrite as Function)(...args);
  }) as NodeJS.WriteStream["write"];

  const realStdoutWriteSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

  app2.unmount();

  // Restore spies before asserting.
  stdout.write = savedWrite as NodeJS.WriteStream["write"];
  const realStdoutCallCount = realStdoutWriteSpy.mock.calls.length;
  realStdoutWriteSpy.mockRestore();

  // No write to the fake shared stdout from app2's unmount.
  expect(writesFromApp2Unmount).toBe(0);
  // No write to real process.stdout from app2's unmount (the write-barrier
  // fallback in resolveExit() must not fire for skipped apps).
  expect(realStdoutCallCount).toBe(0);

  // (d) app1 is still the live owner — a THIRD mount on the same stdout must
  // still warn (proves app2.unmount() did not evict app1's WeakMap entry).
  const thirdWrites: string[] = [];
  const thirdSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    thirdWrites.push(typeof chunk === "string" ? chunk : String(chunk));
    return true;
  });
  const app3 = createApp(App);
  app3.mount({ stdout, stdin, stderr: process.stderr, interactive: false });
  thirdSpy.mockRestore();
  expect(thirdWrites.join("")).toContain(
    "createApp()/mount() was called again for the same stdout before the previous Vue TUI instance was unmounted",
  );

  // Cleanup: app1 still owns the stream; unmount it cleanly.
  app1.unmount();
});

test("unmounting first app allows a subsequent mount on the same stdout (no warning)", async () => {
  const App = defineComponent(() => () => <Text>world</Text>);

  const stdout = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();

  const stderrWrites: string[] = [];
  const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    stderrWrites.push(typeof chunk === "string" ? chunk : String(chunk));
    return true;
  });

  // Mount app1, then unmount it.
  const app1 = createApp(App);
  app1.mount({ stdout, stdin, stderr: process.stderr, interactive: false });
  app1.unmount();

  // Mount app2 on the same stdout — must work normally (no warning).
  const app2 = createApp(App);
  app2.mount({ stdout, stdin, stderr: process.stderr, interactive: false });

  stderrSpy.mockRestore();

  const warnText = stderrWrites.join("");
  expect(warnText).not.toContain("createApp()/mount() was called again for the same stdout");

  // app2 renders cleanly.
  await app2.waitUntilRenderFlush();
  app2.unmount();
});
