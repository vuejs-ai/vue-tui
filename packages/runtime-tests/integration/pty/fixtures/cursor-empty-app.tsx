import process from "node:process";
import { createApp, useApp } from "@vue-tui/runtime";
import { defineComponent, onMounted } from "vue";

// An interactive app whose ROOT renders nothing. Its initial commit emits no
// log-update cursor escape; teardown may still restore cursor visibility. Ink's
// onRender outer gate `output !== lastOutput` is false
// when both are "", so log-update — and its lazy hide — is never reached, and
// the only mount-time hide lives in setAlternateScreen). vue-tui must match:
// a no-content interactive app must NOT hide the terminal cursor.
//
// The no-input app owns no terminal-input state; it exits explicitly after
// signalling readiness so the PTY run resolves.
const App = defineComponent(() => {
  const { exit } = useApp();
  onMounted(() => {
    process.stdout.write("__READY__");
    setTimeout(() => exit(), 100);
  });
  return () => null;
});

const app = createApp(App);
app.mount({ exitOnCtrlC: false });
await app.waitUntilExit();
console.log("exited");
