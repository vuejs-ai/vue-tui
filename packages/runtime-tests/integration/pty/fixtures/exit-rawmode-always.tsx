import process from "node:process";
import { createApp, Text } from "@vue-tui/runtime";
import { defineComponent, h, onMounted } from "vue";

// A NO-input app under the DEFAULT rawMode 'always'. There is no useInput /
// useFocus / usePaste, no explicit setRawMode, and no stdin listener — so the
// App's lifetime raw-mode hold is the ONLY thing keeping the process alive. It
// must therefore NOT auto-exit (under rawMode 'auto' it would render and exit
// immediately, like exit-normally). Ctrl+C still exits it cleanly (exitOnCtrlC
// default + raw mode held), which is the headline benefit: Ctrl+C works on a
// no-input screen.
const App = defineComponent(() => {
  onMounted(() => {
    setTimeout(() => process.stdout.write("__READY__"), 100);
  });

  return () => h(Text, null, "Hello World");
});

const app = createApp(App);
app.mount(); // default rawMode 'always'
await app.waitUntilExit();
console.log("exited");
