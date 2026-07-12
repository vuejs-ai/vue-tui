import { Console as NodeConsole } from "node:console";
import { defineComponent, h } from "vue";
import { expect, test } from "vite-plus/test";
import { createApp } from "@vue-tui/runtime";
import { captureWrites, makeFakeStdin, makeFakeWritable } from "./test-streams.ts";

// vitest's worker console is a custom Console instance that LACKS the
// `Console` constructor property a real Node global console always has.
// patch-console needs `new console.Console(...)`, and render.ts degrades
// gracefully (no patch at all) when it's missing — which would make the
// filter/restore tests below pass vacuously. Restore the real-Node console
// shape so the patch actually installs (safe to leave for the file's
// lifetime: vitest isolates workers per test file).
(console as { Console?: typeof NodeConsole }).Console ??= NodeConsole;

// The console patch must be installed BEFORE the first Vue mount (Ink patches
// in its constructor, ink.tsx:435-436, before the first React render). A root
// whose setup() throws makes Vue emit its dev-only "[Vue warn]: Component is
// missing template or render function." DURING the initial mount — with the
// patch installed only after mount, that warn escaped to the real console even
// with patchConsole on. (Defined inline, not in a fixture module: see the
// SSR register-helper note in error-overview.test.tsx.)
test("a [Vue warn] from the initial mount is filtered (patch installed before mount)", async () => {
  const SetupThrower = defineComponent(() => {
    throw new Error("setup boom");
  });

  const stdout = makeFakeWritable();
  const stderr = makeFakeWritable();
  const stderrWrites = captureWrites(stderr);
  const { stream: stdin } = makeFakeStdin();

  // Recorder stands in for the REAL console.warn: anything that reaches it
  // escaped the patch (the late-patch bug routed initial-mount warns here).
  const realWarn = console.warn;
  const escapedWarns: string[] = [];
  console.warn = (...args: unknown[]) => {
    escapedWarns.push(args.map(String).join(" "));
  };

  try {
    const app = createApp(SetupThrower);
    app.mount({ stdout, stderr, stdin, maxFps: 0 });
    await expect(app.waitUntilExit()).rejects.toThrow("setup boom");
  } finally {
    console.warn = realWarn;
  }

  expect(escapedWarns.filter((w) => w.startsWith("[Vue warn]"))).toEqual([]);
  // The filter DROPS the warn rather than routing it to the app's stderr.
  expect(stderrWrites.filter((w) => w.startsWith("[Vue warn]"))).toEqual([]);
});

test("console is restored when mount throws synchronously", () => {
  // A vnode whose `type` getter throws during the renderer's patch phase
  // bypasses onErrorCaptured, so originalMount throws SYNCHRONOUSLY (same
  // repro as cursor-commit-path's DEFECT 2). With the patch now installed
  // before mount, the throw path must still restore the console via the
  // mount-catch teardown() — otherwise the [Vue warn] filter would keep
  // swallowing console output for the rest of the process.
  const ThrowOnPatchApp = defineComponent(() => {
    return () => {
      const vnode = h("div");
      Object.defineProperty(vnode, "type", {
        get() {
          throw new Error("boom from vnode type getter");
        },
      });
      return vnode as never;
    };
  });

  const stdout = makeFakeWritable();
  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();

  const logBefore = console.log;
  const warnBefore = console.warn;

  const app = createApp(ThrowOnPatchApp);
  expect(() => app.mount({ stdout, stderr, stdin, maxFps: 0 })).toThrow(
    "boom from vnode type getter",
  );

  expect(console.log).toBe(logBefore);
  expect(console.warn).toBe(warnBefore);
});
