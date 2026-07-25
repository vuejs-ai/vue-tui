import { createApp } from "@vue-tui/runtime";
import App from "./app.vue";

const testGlobal = globalThis as {
  __VT_INPUT_ACTIVE_MOUNT__?: number;
  __VT_INPUT_MOUNTS__?: number;
  __VT_TEST_APP__?: ReturnType<typeof createApp>;
  __VT_TEST_STDIN__?: NodeJS.ReadStream;
  __VT_TEST_STDOUT__?: NodeJS.WriteStream;
};
const app = createApp(App);
testGlobal.__VT_INPUT_MOUNTS__ = (testGlobal.__VT_INPUT_MOUNTS__ ?? 0) + 1;
testGlobal.__VT_INPUT_ACTIVE_MOUNT__ = testGlobal.__VT_INPUT_MOUNTS__;
testGlobal.__VT_TEST_APP__ = app;
app.mount({
  stdin: testGlobal.__VT_TEST_STDIN__ ?? process.stdin,
  stdout: testGlobal.__VT_TEST_STDOUT__ ?? process.stdout,
  patchConsole: false,
});
