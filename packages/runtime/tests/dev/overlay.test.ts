import { test, expect, afterEach, vi } from "vite-plus/test";
import { defineComponent, h } from "vue";
import { PassThrough } from "node:stream";
import { connectDevtools, devState, resetDevState } from "../../src/dev/hmr.ts";
import { createApp } from "../../src/api/create-app.ts";
import { createInternalMountOptions } from "../../src/api/internal-mount-options.ts";
import { Text } from "../../src/api/index.ts";

// Ensure the development overlay supplies its default slot as a function so Vue
// emits no non-function-slot warning. Mount with `patchConsole: false` so Vue
// warnings reach `console.warn` and the spy observes them. `maxFps: 0` keeps the
// test independent of render-throttle timing.

let app: ReturnType<typeof createApp> | undefined;

afterEach(() => {
  app?.unmount();
  app = undefined;
  resetDevState();
  vi.restoreAllMocks();
});

function newOverlayApp() {
  const out: string[] = [];
  const stdout = new PassThrough() as unknown as NodeJS.WriteStream;
  // Live overlay frames require a TTY surface (non-TTY mounts only write at teardown).
  Object.assign(stdout, { isTTY: true, columns: 80, rows: 24 });
  stdout.on("data", (chunk) => out.push(String(chunk)));
  connectDevtools({ on: () => {}, send: () => {} });
  app = createApp(defineComponent(() => () => h(Text, null, () => "hi")));
  return { stdout, out };
}

function slotWarnings(spy: ReturnType<typeof vi.spyOn>): string[] {
  return (spy.mock.calls as unknown[][])
    .map((args) => args.map((a) => String(a)).join(" "))
    .filter((line) => /Non-function value|default slot/.test(line));
}

test("dev overlay ok-state wrapper does not emit a Non-function default-slot warning", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const { stdout } = newOverlayApp();
  // devState stays "ok" after createApp's resetDevState() — exercises the
  // EVERY-dev-session wrapper render path in overlay.ts.
  app!.mount(createInternalMountOptions({ stdout, patchConsole: false, maxFps: 0 }));
  await Promise.resolve();

  expect(slotWarnings(warn)).toEqual([]);
});

test("dev overlay error-state (ErrorDisplay) does not emit a Non-function default-slot warning", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const { stdout, out } = newOverlayApp();
  devState.value = {
    type: "error",
    error: { message: "BUILD-FAIL-XYZ\n/path/to/app.vue\n1 | broken code" },
  };
  app!.mount(createInternalMountOptions({ stdout, patchConsole: false, maxFps: 0 }));
  await Promise.resolve();

  // Sanity: the error overlay really rendered (so we know ErrorDisplay's Box was
  // mounted and its slot path actually exercised).
  expect(out.join("")).toContain("BUILD-FAIL-XYZ");
  expect(out.join("")).not.toContain("broken code");
  expect(slotWarnings(warn)).toEqual([]);
});
