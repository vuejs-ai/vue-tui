// SEQUENTIAL: mutates a dedicated fixture plus process-global output and HMR
// probes. A fresh worker also isolates Vue's process-global SFC HMR registry.
import { afterEach, expect, test } from "vite-plus/test";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vue from "@vitejs/plugin-vue";
import type { TextSelectionCommands } from "@vue-tui/runtime/fullscreen";
import { createServer, type ViteDevServer } from "vite";
import { vueTui } from "../src/index.ts";
import { capture, waitFor, waitUntil } from "./helpers.ts";

const root = fileURLToPath(new URL("./fixtures/selection-hmr", import.meta.url));
const appVue = fileURLToPath(new URL("./fixtures/selection-hmr/src/app.vue", import.meta.url));
const origAppVue = readFileSync(appVue, "utf8");
let server: ViteDevServer | undefined;

interface TestGlobal {
  __VT_SELECTION_COMMANDS__?: TextSelectionCommands[];
  __VT_SELECTION_CURRENT__?: TextSelectionCommands;
  __VT_SELECTION_TARGET_FIRST__?: object;
  __VT_SELECTION_TARGET_CURRENT__?: object | null;
  __VT_TEST_APP__?: { unmount(): void };
  __VT_TEST_STDOUT__?: NodeJS.WriteStream;
}

function testGlobal(): TestGlobal {
  return globalThis as TestGlobal;
}

afterEach(async () => {
  testGlobal().__VT_TEST_APP__?.unmount();
  await server?.close();
  server = undefined;
  writeFileSync(appVue, origAppVue);
  delete testGlobal().__VT_SELECTION_COMMANDS__;
  delete testGlobal().__VT_SELECTION_CURRENT__;
  delete testGlobal().__VT_SELECTION_TARGET_FIRST__;
  delete testGlobal().__VT_SELECTION_TARGET_CURRENT__;
  delete testGlobal().__VT_TEST_APP__;
  delete testGlobal().__VT_TEST_STDOUT__;
});

test("Fullscreen text selection releases and reacquires its target and range across HMR", async () => {
  const read = capture({ terminal: true });
  server = await createServer({
    root,
    logLevel: "silent",
    configFile: false,
    plugins: [vue(), vueTui()],
  });
  await server.listen();
  await waitFor(read, "selection=A:ready:selected=<empty>");

  const firstCommands = testGlobal().__VT_SELECTION_CURRENT__!;
  const firstTarget = testGlobal().__VT_SELECTION_TARGET_FIRST__;
  expect(firstCommands).toBeDefined();
  expect(firstTarget).toBeDefined();
  expect(firstCommands.selectAll()).toBe(true);
  await waitFor(read, "selection=A:ready:selected=DOC-A");
  expect(firstCommands.state.value).toMatchObject({
    status: "ready",
    range: { anchor: 0, extent: 5 },
    selectedText: "DOC-A",
  });

  const templateHot = origAppVue
    .replace(":key=\"'cold'\"", ":key=\"'hot'\"")
    .replace("DOC-A", "DOC-B-HOT");
  const templateOutputStart = read().length;
  writeFileSync(appVue, templateHot);
  await waitFor(() => read().slice(templateOutputStart), "DOC-B-HOT");
  await waitFor(() => read().slice(templateOutputStart), "selection=A:ready:selected=<empty>");
  expect(testGlobal().__VT_SELECTION_CURRENT__).toBe(firstCommands);
  expect(testGlobal().__VT_SELECTION_COMMANDS__).toHaveLength(1);
  expect(testGlobal().__VT_SELECTION_TARGET_CURRENT__).not.toBe(firstTarget);
  expect(firstCommands.state.value).toMatchObject({
    status: "ready",
    range: null,
    selectedText: "",
  });
  expect(firstCommands.selectAll()).toBe(true);
  await waitFor(read, "selection=A:ready:selected=DOC-B-HOT");

  writeFileSync(appVue, templateHot.replace('const generation = "A";', 'const generation = "B";'));
  await waitFor(read, "selection=B:ready:selected=<empty>");
  await waitUntil(() => testGlobal().__VT_SELECTION_COMMANDS__?.length === 2);

  const replacementCommands = testGlobal().__VT_SELECTION_CURRENT__!;
  expect(replacementCommands).not.toBe(firstCommands);
  expect(testGlobal().__VT_SELECTION_COMMANDS__).toHaveLength(2);
  expect(firstCommands.state.value).toEqual({
    status: "inactive",
    range: null,
    selectedText: "",
  });
  expect(replacementCommands.state.value).toMatchObject({
    status: "ready",
    range: null,
    selectedText: "",
  });
  expect(replacementCommands.selectAll()).toBe(true);
  await waitFor(read, "selection=B:ready:selected=DOC-B-HOT");
});
