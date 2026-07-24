import { PassThrough } from "node:stream";
import { createApp } from "@vue-tui/runtime";
import App from "./app.vue";

const stdout =
  (globalThis as { __VT_TEST_STDOUT__?: NodeJS.WriteStream }).__VT_TEST_STDOUT__ ?? process.stdout;
const stdin = new PassThrough() as unknown as NodeJS.ReadStream & {
  isRaw: boolean;
  setRawMode(mode: boolean): NodeJS.ReadStream;
};
Object.assign(stdin, {
  isTTY: true,
  isRaw: false,
  setRawMode(mode: boolean) {
    stdin.isRaw = mode;
    return stdin;
  },
});
const app = createApp(App);
(globalThis as { __VT_TEST_APP__?: typeof app }).__VT_TEST_APP__ = app;
app.mount({ patchConsole: false, stdin, stdout });
