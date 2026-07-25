import { PassThrough } from "node:stream";
import { createApp } from "@vue-tui/runtime";
import App from "./app.vue";

const stdout =
  (globalThis as { __VT_TEST_STDOUT__?: NodeJS.WriteStream }).__VT_TEST_STDOUT__ ?? process.stdout;
const testStdin = new PassThrough() as unknown as NodeJS.ReadStream & {
  isRaw: boolean;
  setRawMode(mode: boolean): NodeJS.ReadStream;
};
Object.assign(testStdin, {
  isTTY: true,
  isRaw: false,
  setRawMode(mode: boolean) {
    testStdin.isRaw = mode;
    return testStdin;
  },
});
const visualReview = process.env.VUE_TUI_VISUAL_REVIEW === "1";
const stdin = visualReview ? process.stdin : testStdin;
const app = createApp(App);
(globalThis as { __VT_TEST_APP__?: typeof app }).__VT_TEST_APP__ = app;
app.mount({ exitOnCtrlC: visualReview, patchConsole: visualReview, stdin, stdout });
