// SEQUENTIAL: edits a shared fixture and installs process-global stream seams.
import { afterEach, expect, test } from "vite-plus/test";
import { readFileSync, writeFileSync } from "node:fs";
import { PassThrough } from "node:stream";
import { fileURLToPath } from "node:url";
import vue from "@vitejs/plugin-vue";
import { createServer, type ViteDevServer } from "vite";
import { vueTui } from "../src/index.ts";
import { capture, waitFor } from "./helpers.ts";

const root = fileURLToPath(new URL("./fixtures/mouse-hmr", import.meta.url));
const targetVue = fileURLToPath(new URL("./fixtures/mouse-hmr/src/target.vue", import.meta.url));
const origTargetVue = readFileSync(targetVue, "utf8");
const originalTerm = process.env.TERM;
let server: ViteDevServer | undefined;

function createStdin(): NodeJS.ReadStream & PassThrough {
  const stdin = new PassThrough() as NodeJS.ReadStream & PassThrough;
  Object.assign(stdin, {
    isTTY: true,
    isRaw: false,
    setRawMode(mode: boolean) {
      stdin.isRaw = mode;
      return stdin;
    },
  });
  return stdin;
}

afterEach(async () => {
  const testGlobal = globalThis as Record<string, unknown>;
  const app = testGlobal.__VT_TEST_APP__ as { unmount(): void } | undefined;
  app?.unmount();
  await server?.close();
  server = undefined;
  writeFileSync(targetVue, origTargetVue);
  delete testGlobal.__VT_TEST_STDIN__;
  delete testGlobal.__VT_TEST_STDOUT__;
  delete testGlobal.__VT_TEST_APP__;
  delete testGlobal.__VT_MOUSE_TARGET_FIRST__;
  delete testGlobal.__VT_MOUSE_TARGET_CURRENT__;
  if (originalTerm === undefined) delete process.env.TERM;
  else process.env.TERM = originalTerm;
});

test("Fullscreen mouse targeting follows template and script HMR without duplicate routes", async () => {
  process.env.TERM = "xterm-256color";
  const read = capture({ terminal: true });
  const stdin = createStdin();
  (globalThis as Record<string, unknown>).__VT_TEST_STDIN__ = stdin;
  server = await createServer({
    root,
    logLevel: "silent",
    configFile: false,
    plugins: [vue(), vueTui()],
  });
  await server.listen();

  await waitFor(read, "TARGET-A");
  await waitFor(read, "\x1b[?1000h\x1b[?1006h");
  const firstTarget = (globalThis as Record<string, unknown>).__VT_MOUSE_TARGET_FIRST__;
  expect(firstTarget).toBeDefined();

  stdin.write("\x1b[<0;1;1M\x1b[<0;1;1m");
  await waitFor(read, "clicks=1");

  writeFileSync(
    targetVue,
    origTargetVue.replace(
      '<Box :width="20" :height="2">\n    <Text>TARGET-A</Text>\n  </Box>',
      "<Text>TARGET-B-HOT</Text>",
    ),
  );
  await waitFor(read, "TARGET-B-HOT");
  expect((globalThis as Record<string, unknown>).__VT_MOUSE_TARGET_CURRENT__).toBe(firstTarget);

  stdin.write("\x1b[<0;1;1M\x1b[<0;1;1m");
  await waitFor(read, "clicks=2");

  const hotTargetVue = readFileSync(targetVue, "utf8");
  writeFileSync(
    targetVue,
    hotTargetVue
      .replace("</script>", 'const reloadMarker = "RELOAD";\n</script>')
      .replace("<Text>TARGET-B-HOT</Text>", "<Text>TARGET-C-{{ reloadMarker }}</Text>"),
  );
  await waitFor(read, "TARGET-C-RELOAD");
  const reloadedTarget = (globalThis as Record<string, unknown>).__VT_MOUSE_TARGET_CURRENT__;
  expect(reloadedTarget).toBeDefined();
  expect(reloadedTarget).not.toBe(firstTarget);

  stdin.write("\x1b[<0;1;1M\x1b[<0;1;1m");
  await waitFor(read, "clicks=3");

  const beforeUnmount = read().length;
  const app = (globalThis as Record<string, unknown>).__VT_TEST_APP__ as { unmount(): void };
  app.unmount();
  delete (globalThis as Record<string, unknown>).__VT_TEST_APP__;
  await waitFor(() => read().slice(beforeUnmount), "\x1b[?1000l\x1b[?1006l");
}, 15_000);
