// Sequential: asserts on the process-global live yoga-node count
// (yogaNodeTracker), which concurrent siblings that mount/unmount apps would
// perturb. Tests are it.sequential.
//
// Bug: a SYNCHRONOUS throw during mount() BEFORE the originalMount try/catch
// (e.g. stdin.setRawMode raising ERR_TTY_INIT_FAILED on a broken PTY, or kitty
// enable's stdout.write throwing) skipped teardown(). liveInstances kept the
// entry forever (poisoning the stdout: every later mount() hit the reuse guard
// and no-op'd), the yoga root leaked, and raw mode was left on.

import { createRequire } from "node:module";
import { defineComponent } from "vue";
import { expect, test, vi, afterEach } from "vite-plus/test";
import { createApp, Text } from "@vue-tui/runtime";
import { yogaNodeTracker } from "@vue-tui/runtime/internal";
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

test.sequential("a synchronous setRawMode throw during mount() runs teardown: rethrows + does not poison the stdout", async () => {
  yogaNodeTracker.reset();
  const liveBefore = yogaNodeTracker.snapshot().live;

  const App = defineComponent(() => () => <Text>hello</Text>);

  const stdout = makeFakeWritable();
  const stderr = makeFakeWritable();

  // A TTY stdin whose setRawMode throws — simulates Node's
  // ERR_TTY_INIT_FAILED on an SSH/container PTY that reports isTTY=true.
  const { stream: stdin } = makeFakeStdin();
  const ttyError = new Error("ERR_TTY_INIT_FAILED");
  (stdin as unknown as { setRawMode: (m: boolean) => unknown }).setRawMode = () => {
    throw ttyError;
  };

  const { warnings, restore } = spyOnGuardWarnings();

  // (1) mount() must rethrow the injected error (the caller still sees it).
  // rawMode defaults to "always" + interactive (TTY stdout) → the App acquires
  // a lifetime raw-mode hold, which calls the throwing setRawMode.
  const app1 = createApp(App);
  expect(() => app1.mount({ stdout, stdin, stderr, liveUpdates: true })).toThrow(
    "ERR_TTY_INIT_FAILED",
  );
  expect(warnings.join("")).not.toContain("Cannot unmount an app that is not mounted");

  // (2) The stdout is NOT poisoned: a subsequent mount() on the SAME stdout
  // succeeds and renders, proving liveInstances was cleaned up by teardown()
  // (before the fix this warned + no-op'd). Use a stdin that does NOT throw.
  const { stream: stdin2 } = makeFakeStdin();
  const writes = captureWrites(stdout);
  const app2 = createApp(App);
  app2.mount({ stdout, stdin: stdin2, stderr, debug: true, exitOnCtrlC: false });
  await app2.waitUntilRenderFlush();

  restore();
  expect(writes.join("")).toContain("hello");

  app2.unmount();

  // (3) The yoga root allocated during the failed mount was freed (no leak):
  // after the successful second app unmounts, live count is back to baseline.
  expect(yogaNodeTracker.snapshot().live).toBe(liveBefore);
});

test.sequential("a synchronous stdout.write throw during kitty enable runs teardown (no poison)", async () => {
  const App = defineComponent(() => () => <Text>kitty</Text>);

  // A stdout whose write throws once kitty tries to enable the protocol.
  const stdout = makeFakeWritable();
  const enableError = new Error("BROKEN_STREAM_ON_KITTY_ENABLE");
  const originalWrite = stdout.write.bind(stdout);
  stdout.write = ((...args: unknown[]) => {
    const chunk = String(args[0]);
    // Kitty enable writes the push-flags CSI ("\x1b[>...u"); throw only on it.
    if (chunk.includes("\x1b[>")) throw enableError;
    return (originalWrite as Function)(...args);
  }) as NodeJS.WriteStream["write"];

  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();
  const { warnings, restore } = spyOnGuardWarnings();

  // (1) mount() rethrows the kitty-enable error.
  const app1 = createApp(App);
  expect(() =>
    app1.mount({
      stdout,
      stdin,
      stderr,
      liveUpdates: true,
      kittyKeyboard: { mode: "enabled" },
    }),
  ).toThrow("BROKEN_STREAM_ON_KITTY_ENABLE");
  expect(warnings.join("")).not.toContain("Cannot unmount an app that is not mounted");

  // (2) Not poisoned: a fresh mount on the same stdout must NOT warn (the
  // registry entry was evicted by teardown). Repair the stream first.
  stdout.write = originalWrite as NodeJS.WriteStream["write"];
  const { stream: stdin2 } = makeFakeStdin();
  const app2 = createApp(App);
  app2.mount({ stdout, stdin: stdin2, stderr, debug: true, exitOnCtrlC: false });
  expect(warnings.join("")).not.toContain(GUARD_WARNING);
  restore();
  app2.unmount();
});

test.sequential("a throw AFTER attachYoga (during setWidth) still frees the yoga root", async () => {
  // Targets the `mountedRoot = tuiRoot` ordering: attachYoga() has already
  // allocated the root's yoga node, and its initial setWidth() throws. Recording mountedRoot
  // BEFORE setWidth lets teardown's
  // `if (mountedRoot) detachYoga(mountedRoot)` free that node.
  yogaNodeTracker.reset();
  const liveBefore = yogaNodeTracker.snapshot().live;

  const App = defineComponent(() => () => <Text>after-attach</Text>);

  // Resolve the runtime's own Yoga dependency and fail the exact root-width
  // call. A throwing stdout getter would now fail earlier during F1.4 session
  // resolution and would no longer exercise this post-allocation window.
  const localRequire = createRequire(import.meta.url);
  const runtimeRequire = createRequire(localRequire.resolve("@vue-tui/runtime/package.json"));
  const yogaModule = (await import(runtimeRequire.resolve("yoga-layout"))) as {
    default: { Node: { prototype: { setWidth(width: number): void } } };
  };
  const widthError = new Error("YOGA_SET_WIDTH_FAILED");
  vi.spyOn(yogaModule.default.Node.prototype, "setWidth").mockImplementationOnce(() => {
    throw widthError;
  });
  const stdout = makeFakeWritable({ columns: 100, rows: 100 });

  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();
  const { warnings, restore } = spyOnGuardWarnings();

  // (1) mount() rethrows the setWidth error.
  const app1 = createApp(App);
  expect(() => app1.mount({ stdout, stdin, stderr, liveUpdates: false })).toThrow(
    "YOGA_SET_WIDTH_FAILED",
  );
  expect(warnings.join("")).not.toContain("Cannot unmount an app that is not mounted");

  restore();

  // (2) The yoga root allocated by attachYoga was freed (no leak): live count
  // is back to baseline immediately after the failed mount.
  expect(yogaNodeTracker.snapshot().live).toBe(liveBefore);
  // No registry poison was introduced.
  expect(warnings.join("")).not.toContain(GUARD_WARNING);
});
