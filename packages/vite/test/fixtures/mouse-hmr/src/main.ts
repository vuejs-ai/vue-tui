import { createApp } from "@vue-tui/runtime";
import App from "./app.vue";

const testGlobal = globalThis as {
  __VT_TEST_APP__?: ReturnType<typeof createApp>;
  __VT_TEST_STDIN__?: NodeJS.ReadStream;
  __VT_TEST_STDOUT__?: NodeJS.WriteStream;
};

const app = createApp(App);
testGlobal.__VT_TEST_APP__ = app;
app.mount({
  mode: "fullscreen",
  liveUpdates: true,
  patchConsole: false,
  maxFps: 0,
  stdin: testGlobal.__VT_TEST_STDIN__ ?? process.stdin,
  stdout: testGlobal.__VT_TEST_STDOUT__ ?? process.stdout,
});
