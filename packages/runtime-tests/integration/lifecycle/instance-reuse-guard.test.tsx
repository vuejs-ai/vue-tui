/**
 * G14 – per-stdout instance-reuse guard (Ink parity).
 *
 * Mirrors Ink's WeakMap<WriteStream, Ink> / getInstance() contract:
 * mounting a second vue-tui app on a stdout that already has a live (not-yet-
 * unmounted) instance should warn on process.stderr and NOT wire a second
 * renderer. After the first app unmounts, mounting on the same stdout again
 * must work normally.
 */

import { defineComponent, nextTick, shallowRef } from "vue";
import { expect, test, vi, afterEach } from "vite-plus/test";
import { createApp, Text } from "@vue-tui/runtime";
import { captureWrites, makeFakeWritable, makeFakeStdin } from "./test-streams.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

/** Spy on native process.stderr (where the reuse-guard warning is written). */
function spyOnGuardWarnings(): { warnings: string[]; restore: () => void } {
  const warnings: string[] = [];
  const spy = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    warnings.push(typeof chunk === "string" ? chunk : String(chunk));
    return true;
  });
  return { warnings, restore: () => spy.mockRestore() };
}

const GUARD_WARNING = "this stdout already has a live app";

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
  app1.mount({ stdout, stdin, stderr: process.stderr, liveUpdates: false });

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

  app2.mount({ stdout, stdin, stderr: process.stderr, liveUpdates: false });

  // (a) A warning containing the key phrase was written to process.stderr.
  stderrSpy.mockRestore();
  expect(stderrWrites.join("")).toContain("this stdout already has a live app");

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
  app3.mount({ stdout, stdin, stderr: process.stderr, liveUpdates: false });
  thirdSpy.mockRestore();
  expect(thirdWrites.join("")).toContain("this stdout already has a live app");

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
  app1.mount({ stdout, stdin, stderr: process.stderr, liveUpdates: false });
  app1.unmount();

  // Mount app2 on the same stdout — must work normally (no warning).
  const app2 = createApp(App);
  app2.mount({ stdout, stdin, stderr: process.stderr, liveUpdates: false });

  stderrSpy.mockRestore();

  const warnText = stderrWrites.join("");
  expect(warnText).not.toContain("this stdout already has a live app");

  // app2 renders cleanly.
  await app2.waitUntilRenderFlush();
  app2.unmount();
});

// The three tests below pin the guard's CALL-SCOPED semantics (audit e18): a
// guarded mount() is inert for THAT call only — it must never poison the app's
// ability to tear down the mount it ACTUALLY wired. Each uses unthrottled commits
// so "a frame painted after
// unmount()" is directly observable on the fake stream, mirroring the run-based
// probes (/tmp/ink-audit/e18x-*.mjs) that established the bug.

test("owner double-firing mount() on its own live stdout keeps a working unmount()", async () => {
  // e18x case (a): app1 mounts, then mistakenly calls mount() AGAIN on its own
  // live stdout. The second call must warn and stay inert, but the warning's
  // own prescribed recovery — unmount() the existing app — must still tear
  // down the FIRST (real) mount: no frame after unmount, registry entry freed.
  const msg = shallowRef("OWNER-A");
  const App = defineComponent(() => () => <Text>{msg.value}</Text>);

  const stdout = makeFakeWritable();
  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();
  const writes = captureWrites(stdout);
  const { warnings, restore } = spyOnGuardWarnings();

  const app1 = createApp(App);
  app1.mount({ stdout, stdin, stderr, maxFps: 0 });
  await nextTick();
  await nextTick();
  expect(writes.join("")).toContain("OWNER-A");

  // Double-fire: warns, wires nothing.
  app1.mount({ stdout, stdin, stderr, maxFps: 0 });
  expect(warnings.join("")).toContain(GUARD_WARNING);

  // The recovery path: unmount() must tear down the real first mount.
  const exit1 = app1.waitUntilExit();
  app1.unmount();
  await exit1;

  // (1) No frame paints after unmount.
  const writesAtUnmount = writes.length;
  msg.value = "OWNER-B-AFTER-UNMOUNT";
  await nextTick();
  await nextTick();
  expect(writes.slice(writesAtUnmount).join("")).not.toContain("OWNER-B-AFTER-UNMOUNT");

  // (2) Registry entry freed: a fresh mount on the same stdout must NOT warn.
  warnings.length = 0;
  const app2 = createApp(defineComponent(() => () => <Text>FRESH</Text>));
  app2.mount({ stdout, stdin, stderr, maxFps: 0 });
  expect(warnings.join("")).not.toContain(GUARD_WARNING);
  restore();
  app2.unmount();
});

test("an app that once hit the guard can later mount AND unmount on a free stdout", async () => {
  // e18x case (b): appY first hits the guard on a busy stdout A, then mounts
  // legitimately on a FREE stdout B. The earlier guarded call must not poison
  // appY: unmount() must tear down the B renderer and free B's registry entry.
  const stdoutA = makeFakeWritable();
  const stdoutB = makeFakeWritable();
  const stderr = makeFakeWritable();
  const { stream: stdinA } = makeFakeStdin();
  const { stream: stdinB } = makeFakeStdin();
  const { warnings, restore } = spyOnGuardWarnings();

  const owner = createApp(defineComponent(() => () => <Text>OWNER-ON-A</Text>));
  owner.mount({ stdout: stdoutA, stdin: stdinA, stderr, maxFps: 0 });
  await nextTick();
  await nextTick();

  const msg = shallowRef("Y-ON-B-FIRST");
  const appY = createApp(defineComponent(() => () => <Text>{msg.value}</Text>));

  // Guarded call on busy A: warns, inert.
  appY.mount({ stdout: stdoutA, stdin: stdinB, stderr, maxFps: 0 });
  expect(warnings.join("")).toContain(GUARD_WARNING);

  // Legitimate mount on free B: renders normally.
  const writesB = captureWrites(stdoutB);
  appY.mount({ stdout: stdoutB, stdin: stdinB, stderr, maxFps: 0 });
  await nextTick();
  await nextTick();
  expect(writesB.join("")).toContain("Y-ON-B-FIRST");

  // unmount() must tear down the B renderer...
  appY.unmount();
  const writesAtUnmount = writesB.length;
  msg.value = "Y-ON-B-AFTER-UNMOUNT";
  await nextTick();
  await nextTick();
  expect(writesB.slice(writesAtUnmount).join("")).not.toContain("Y-ON-B-AFTER-UNMOUNT");

  // ...and free B's registry entry: a fresh mount on B must NOT warn.
  warnings.length = 0;
  const appZ = createApp(defineComponent(() => () => <Text>FRESH-ON-B</Text>));
  appZ.mount({ stdout: stdoutB, stdin: stdinB, stderr, maxFps: 0 });
  expect(warnings.join("")).not.toContain(GUARD_WARNING);
  restore();
  appZ.unmount();
  owner.unmount();
});

test("targeting another app's busy stdout never poisons the caller's own live mount", async () => {
  // e18x case (c): app1 is live on stream A; it calls mount() targeting BUSY
  // stream B (owned by app2). The guarded call must stay scoped to itself:
  // app1's live A mount must remain fully killable, and app2 on B untouched.
  const stdoutA = makeFakeWritable();
  const stdoutB = makeFakeWritable();
  const stderr = makeFakeWritable();
  const { stream: stdinA } = makeFakeStdin();
  const { stream: stdinB } = makeFakeStdin();
  const writesA = captureWrites(stdoutA);
  const { warnings, restore } = spyOnGuardWarnings();

  const msgA = shallowRef("APP1-ON-A-FIRST");
  const app1 = createApp(defineComponent(() => () => <Text>{msgA.value}</Text>));
  app1.mount({ stdout: stdoutA, stdin: stdinA, stderr, maxFps: 0 });
  await nextTick();
  await nextTick();
  expect(writesA.join("")).toContain("APP1-ON-A-FIRST");

  const app2 = createApp(defineComponent(() => () => <Text>APP2-OWNS-B</Text>));
  app2.mount({ stdout: stdoutB, stdin: stdinB, stderr, maxFps: 0 });
  await nextTick();
  await nextTick();

  // app1 (live on A) targets busy B: warns, inert for that call only.
  app1.mount({ stdout: stdoutB, stdin: stdinA, stderr, maxFps: 0 });
  expect(warnings.join("")).toContain(GUARD_WARNING);

  // app1's REAL mount on A must still be killable.
  const exit1 = app1.waitUntilExit();
  app1.unmount();
  await exit1;
  const writesAtUnmount = writesA.length;
  msgA.value = "APP1-ON-A-AFTER-UNMOUNT";
  await nextTick();
  await nextTick();
  expect(writesA.slice(writesAtUnmount).join("")).not.toContain("APP1-ON-A-AFTER-UNMOUNT");

  // A's registry entry freed: a fresh mount on A must NOT warn.
  warnings.length = 0;
  const app3 = createApp(defineComponent(() => () => <Text>FRESH-ON-A</Text>));
  app3.mount({ stdout: stdoutA, stdin: stdinA, stderr, maxFps: 0 });
  expect(warnings.join("")).not.toContain(GUARD_WARNING);

  // Control: app2 still owns B (a mount attempt on B still warns)...
  warnings.length = 0;
  const probe = createApp(defineComponent(() => () => <Text>PROBE</Text>));
  probe.mount({ stdout: stdoutB, stdin: stdinB, stderr, maxFps: 0 });
  expect(warnings.join("")).toContain(GUARD_WARNING);
  restore();

  // ...and app2 unmounts cleanly.
  const exit2 = app2.waitUntilExit();
  app2.unmount();
  await exit2;
  probe.unmount();
  app3.unmount();
});
