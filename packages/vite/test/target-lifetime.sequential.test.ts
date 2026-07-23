// SEQUENTIAL: mutates a shared fixture and process-global capture seams. The
// package test config runs files serially in separate workers, which also gives
// this HMR lifetime test a fresh Vue HMR registry. Reusing the same process after
// another server has registered identical SFC ids would make two independent
// HMR lifetimes share Vue's process-global component records.
import { afterEach, expect, test } from "vite-plus/test";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vue from "@vitejs/plugin-vue";
import { createServer, type ViteDevServer } from "vite";
import { vueTui } from "../src/index.ts";
import { capture, waitFor, waitUntil } from "./helpers.ts";

const root = fileURLToPath(new URL("./fixtures/overlay", import.meta.url));
const targetVue = fileURLToPath(new URL("./fixtures/overlay/src/target.vue", import.meta.url));
const origTargetVue = readFileSync(targetVue, "utf8");
let server: ViteDevServer | undefined;

afterEach(async () => {
  const testGlobal = globalThis as Record<string, unknown>;
  const app = testGlobal.__VT_TEST_APP__ as { unmount(): void } | undefined;
  app?.unmount();
  await server?.close();
  server = undefined;
  writeFileSync(targetVue, origTargetVue);
  delete testGlobal.__VT_TEST_STDOUT__;
  delete testGlobal.__VT_TARGET_INSTANCE__;
  delete testGlobal.__VT_TARGET_CURRENT__;
  delete testGlobal.__VT_TARGET_FOCUSED__;
  delete testGlobal.__VT_TEST_APP__;
});

test("HMR keeps component identity while targeted focus follows replacement and reload", async () => {
  const read = capture({ terminal: true });
  server = await createServer({
    root,
    logLevel: "silent",
    configFile: false,
    plugins: [vue(), vueTui()],
  });
  await server.listen();
  await waitFor(read, "box=7x2");
  await waitUntil(() => (globalThis as Record<string, unknown>).__VT_TARGET_FOCUSED__ === true);
  const targetInstance = (globalThis as Record<string, unknown>).__VT_TARGET_INSTANCE__;
  expect(targetInstance).toBeDefined();

  writeFileSync(
    targetVue,
    origTargetVue.replace(
      '<Box ref="targetBox" :width="7" :height="2">\n    <Text>TARGET-A</Text>\n  </Box>',
      "<Text>TARGET-B-HOT</Text>",
    ),
  );
  await waitFor(read, "TARGET-B-HOT");
  await waitFor(read, "box=7x2");
  await waitUntil(() => (globalThis as Record<string, unknown>).__VT_TARGET_FOCUSED__ === false);

  expect((globalThis as Record<string, unknown>).__VT_TARGET_INSTANCE__).toBe(targetInstance);
  expect((globalThis as Record<string, unknown>).__VT_TARGET_CURRENT__).toBe(targetInstance);

  const hotTargetVue = readFileSync(targetVue, "utf8");
  writeFileSync(
    targetVue,
    hotTargetVue
      .replace("</script>", 'const reloadMarker = "RELOAD";\n</script>')
      .replace("<Text>TARGET-B-HOT</Text>", "<Text>TARGET-C-{{ reloadMarker }}</Text>"),
  );
  await waitFor(read, "TARGET-C-RELOAD");

  const reloadedTarget = (globalThis as Record<string, unknown>).__VT_TARGET_CURRENT__;
  expect(reloadedTarget).toBeDefined();
  expect(reloadedTarget).not.toBe(targetInstance);
  expect((globalThis as Record<string, unknown>).__VT_TARGET_FOCUSED__).toBe(false);
});
