import process from "node:process";
import { Text, createApp, useStdout } from "@vue-tui/runtime";
import { defineComponent, nextTick, shallowRef } from "vue";

process.stdout.rows = 4;
process.stdout.write("PRE_APP_HISTORY\n");

const value = shallowRef("LIVE 0");
let writeCommitted: ((data: string) => void) | undefined;

const App = defineComponent(() => {
  writeCommitted = useStdout().write;
  return () => <Text>{value.value}</Text>;
});

const app = createApp(App);
app.mount({ mode: "inline", exitOnCtrlC: false, maxFps: 0 });
await app.waitUntilRenderFlush();

app.clear();
app.clear();

value.value = "LIVE 1";
await nextTick();
await app.waitUntilRenderFlush();

writeCommitted?.("COMMITTED\n");
value.value = "LIVE 2";
await nextTick();
await app.waitUntilRenderFlush();

app.unmount();
process.stdout.write("POST_APP\n");
