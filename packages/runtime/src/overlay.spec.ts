import { test, expect, afterEach, vi } from "vite-plus/test";
import { defineComponent, h } from "vue";
import { PassThrough } from "node:stream";
import { connectDevtools, devState, resetDevState } from "./hmr.ts";
import { createApp, type InternalMountOptions } from "./render.ts";
import { Text } from "./index.ts";

// Guards against the Vue "[Vue warn]: Non-function value encountered for default
// slot" warning that the dev overlay used to trigger by passing ARRAY children to
// the `Box` component (overlay.ts). The runtime routes console.warn through the
// frame writer in real dev, so that warning is VISIBLE in a real terminal on every
// dev boot — the classic "invisible in tests, visible in the terminal" case. We
// mount with `patchConsole: false` so Vue's warning reaches the real
// `console.warn` and a spy can observe the raw emission. `maxFps: 0` keeps the
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
  Object.assign(stdout, { isTTY: false });
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
  app!.mount({ stdout, liveUpdates: true, patchConsole: false, maxFps: 0 } as InternalMountOptions);
  await Promise.resolve();

  expect(slotWarnings(warn)).toEqual([]);
});

test("dev overlay error-state (ErrorDisplay) does not emit a Non-function default-slot warning", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const { stdout, out } = newOverlayApp();
  devState.value = { type: "error", error: { message: "BUILD-FAIL-XYZ" } };
  app!.mount({ stdout, liveUpdates: true, patchConsole: false, maxFps: 0 } as InternalMountOptions);
  await Promise.resolve();

  // Sanity: the error overlay really rendered (so we know ErrorDisplay's Box was
  // mounted and its slot path actually exercised).
  expect(out.join("")).toContain("BUILD-FAIL-XYZ");
  expect(slotWarnings(warn)).toEqual([]);
});
