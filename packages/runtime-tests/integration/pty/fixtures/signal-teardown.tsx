import process from "node:process";
import { createApp, Text } from "@vue-tui/runtime";
import { defineComponent, onMounted } from "vue";

// Mounts a live interactive app in the alternate screen (cursor hidden), then
// signals readiness on stderr. It deliberately NEVER unmounts/exits on its own
// — `await app.waitUntilExit()` only resolves once teardown runs. The test
// sends a process signal (SIGINT/SIGTERM/SIGHUP); the runtime's signal-exit
// handler then restores the terminal (show cursor + leave alt screen) before
// the process winds down. Because there is no self-unmount path, the presence
// of restore bytes proves the SIGNAL drove teardown — not a coincidental
// normal unmount that would emit the same bytes. Mirrors Ink's
// signalExit(this.unmount) wiring.
const App = defineComponent(() => {
  onMounted(() => {
    // Emit readiness on stderr so the marker is not swallowed by alt-screen
    // restore / final-frame writes on stdout, which the test asserts against.
    // Defer one tick so the first frame is committed and the signal-exit
    // handler is fully registered before the test sends a signal.
    setTimeout(() => {
      process.stderr.write("__READY__\n");
    }, 50);
  });

  return () => <Text>signal teardown fixture</Text>;
});

// `--debug` mounts in debug mode (still interactive). Debug mode enters the
// alternate screen and hides the cursor just like a normal interactive mount,
// so signal-driven teardown must still restore the terminal — this exercises
// Finding 1 (the registration must not be gated on `!debug`).
const debug = process.argv.includes("--debug");

const app = createApp(App);
app.mount({ mode: "fullscreen", debug });

await app.waitUntilExit();
