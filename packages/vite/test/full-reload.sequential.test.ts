// SEQUENTIAL: mutates globalThis.__VT_TEST_STDOUT__ (a process-global frame capture
// seam) and starts a live Vite dev server that binds OS ports. Running these tests
// concurrently with other files would race on the global and risk port conflicts.
//
// Uses a DEDICATED `reload` fixture copy (not `basic`): this test edits the entry
// `src/main.ts`, and file-parallelism (fileParallelism: true) would otherwise race
// the fixture against dev.sequential / overlay.sequential, which edit the same tree.
//
// NOTE: configFile:false + inline vueTui() plugins — see dev.sequential.test.ts for why
// (a rolldown define-vs-transform bug crashes config-file loading on vite-plus-core).
import { test, expect, afterEach } from "vite-plus/test";
import { fileURLToPath } from "node:url";
import { writeFileSync, readFileSync } from "node:fs";
import { createServer, type ViteDevServer } from "vite";
import vue from "@vitejs/plugin-vue";
import { vueTui } from "../src/index.ts";
import { capture, waitUntil } from "./helpers.ts";

const root = fileURLToPath(new URL("./fixtures/reload", import.meta.url));
const exitRoot = fileURLToPath(new URL("./fixtures/exit", import.meta.url));
const mainTs = fileURLToPath(new URL("./fixtures/reload/src/main.ts", import.meta.url));
const origMain = readFileSync(mainTs, "utf8");
let server: ViteDevServer | undefined;

afterEach(async () => {
  // The app-exit test closes the server itself (via the teardown hook); tolerate
  // a double close here.
  await server?.close().catch(() => {});
  server = undefined;
  writeFileSync(mainTs, origMain);
  delete (globalThis as Record<string, unknown>).__VT_TEST_STDOUT__;
});

// Parse the `count=N` values from a captured chunk, in emit order.
function counts(chunk: string): number[] {
  return [...chunk.matchAll(/count=(\d+)/g)].map((m) => Number(m[1]));
}

test("an entry-level (non-HMR) change restarts the app in-process with no zombie", async () => {
  const read = capture();
  server = await createServer({
    root,
    logLevel: "silent",
    configFile: false,
    plugins: [vue(), vueTui()],
  });
  await server.listen();

  // Let the original app boot and tick a few times.
  await waitUntil(() => counts(read()).some((c) => c >= 3));
  const before = read().length;

  // Touch the entry in a way HMR can't accept -> Vite emits a full reload -> the SSR
  // runner re-executes main.ts. The runtime must unmount the OLD app first so the new
  // one renders cleanly (no instance-reuse-guard no-op, no interleaved zombie frames).
  writeFileSync(mainTs, origMain + "\n// reload-marker\n");

  // The reloaded app starts a fresh counter at 0 and must then tick up. Wait until,
  // AFTER the edit, we see a fresh count=0 followed by enough further ticks to judge.
  await waitUntil(() => {
    const after = read().slice(before);
    const i = after.lastIndexOf("count=0");
    return i !== -1 && counts(after.slice(i)).length >= 4;
  });

  const after = read().slice(before);
  // The app re-rendered after the reload.
  expect(after).toContain("LABEL-A");

  // No zombie: from the reloaded app's first frame (its last count=0), the counter
  // is a SINGLE strictly-consecutive sequence (0,1,2,3,...). A surviving old app
  // would interleave its higher counts here, breaking the +1 step.
  const fresh = counts(after.slice(after.lastIndexOf("count=0")));
  expect(fresh[0]).toBe(0);
  for (let k = 1; k < fresh.length; k++) {
    expect(fresh[k]).toBe(fresh[k - 1] + 1);
  }

  // A SECOND entry edit must reload just as cleanly (the runtime's
  // vite:beforeFullReload handler has to survive across reloads).
  const before2 = read().length;
  writeFileSync(mainTs, origMain + "\n// reload-marker-2\n");
  await waitUntil(() => {
    const a2 = read().slice(before2);
    const i = a2.lastIndexOf("count=0");
    return i !== -1 && counts(a2.slice(i)).length >= 4;
  });
  const after2 = read().slice(before2);
  const fresh2 = counts(after2.slice(after2.lastIndexOf("count=0")));
  expect(fresh2[0]).toBe(0);
  for (let k = 1; k < fresh2.length; k++) {
    expect(fresh2[k]).toBe(fresh2[k - 1] + 1);
  }
});

test("survives a SECOND full reload when @vue-tui/runtime is EXTERNALIZED (the published-install path)", async () => {
  const read = capture();
  // A real `npm install` puts @vue-tui/runtime in node_modules, which Vite's SSR runner
  // EXTERNALIZES — so the runtime's module-globals persist across full reloads. The
  // workspace-bundled monorepo path (the test above) re-executes the runtime each reload,
  // so it can NOT catch a process-lifetime bridge guard; force externalization here to
  // cover the default published path. middlewareMode + watcher.emit => no port, no file
  // writes (cannot race sibling fixtures).
  server = await createServer({
    root,
    logLevel: "silent",
    configFile: false,
    plugins: [vue(), vueTui()],
    ssr: { external: ["@vue-tui/runtime", "@vue-tui/runtime/internal"] },
    server: { middlewareMode: true },
  });
  const env = server.environments.ssr as unknown as {
    runner: { import: (id: string) => Promise<unknown> };
  };
  await env.runner.import("/src/main.ts");
  await waitUntil(() => counts(read()).some((c) => c >= 3));

  const freshReload = async () => {
    const before = read().length;
    server!.watcher.emit("change", mainTs);
    await waitUntil(() => {
      const after = read().slice(before);
      const i = after.lastIndexOf("count=0");
      return i !== -1 && counts(after.slice(i)).length >= 4;
    });
  };

  // Reload #1 is clean even with the bug. Reload #2 is where a process-lifetime bridge
  // guard bites: after reload #1 the re-imported dev module's connectDevtools() can't
  // re-register listeners, so vite:beforeFullReload never fires, the old app is never
  // torn down, and the new mount hits the instance-reuse guard — a zombie counter keeps
  // climbing with no fresh count=0.
  await freshReload();
  const before2 = read().length;
  server.watcher.emit("change", mainTs);
  await waitUntil(() => {
    const a2 = read().slice(before2);
    const i = a2.lastIndexOf("count=0");
    return i !== -1 && counts(a2.slice(i)).length >= 4;
  });
  const after2 = read().slice(before2);
  const fresh2 = counts(after2.slice(after2.lastIndexOf("count=0")));
  expect(fresh2[0]).toBe(0);
  for (let k = 1; k < fresh2.length; k++) expect(fresh2[k]).toBe(fresh2[k - 1] + 1);
});

test("a genuine app exit closes the in-process dev server", async () => {
  const read = capture();
  server = await createServer({
    root: exitRoot,
    logLevel: "silent",
    configFile: false,
    plugins: [vue(), vueTui()],
  });
  // Spy on close so we can detect the runtime-driven teardown. dev.ts captured
  // `server` and calls server.close() at exit time, so it sees this wrapper.
  let closed = false;
  const origClose = server.close.bind(server);
  server.close = (() => {
    closed = true;
    return origClose();
  }) as typeof server.close;
  await server.listen();

  await waitUntil(() => read().includes("EXIT-FIXTURE"));
  // The app calls useApp().exit() ~50ms after mount; the runtime then emits
  // "vue-tui:exit" over the hot channel and the dev plugin's listener closes the server.
  await waitUntil(() => closed);
  expect(closed).toBe(true);
});
