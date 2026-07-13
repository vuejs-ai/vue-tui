import process from "node:process";
import { Box, createApp, Text } from "@vue-tui/runtime";
import { useMouseDrag } from "@vue-tui/runtime/fullscreen";
import { defineComponent, onMounted, shallowRef, type ComponentPublicInstance } from "vue";

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
  const mouseTarget = shallowRef<ComponentPublicInstance | null>(null);
  useMouseDrag(mouseTarget, () => {});

  onMounted(() => {
    // Emit readiness on stderr so the marker is not swallowed by alt-screen
    // restore / final-frame writes on stdout, which the test asserts against.
    // Defer one tick so the first frame is committed and the signal-exit
    // handler is fully registered before the test sends a signal.
    setTimeout(() => {
      process.stderr.write("__READY__\n");
    }, 50);
  });

  return () => (
    <Box ref={mouseTarget}>
      <Text>signal teardown fixture</Text>
    </Box>
  );
});

// The unthrottled variant proves signal restoration is independent of commit
// scheduling while exercising the same full-screen terminal ownership.
const unthrottled = process.argv.includes("--unthrottled");

const app = createApp(App);
app.mount({ mode: "fullscreen", maxFps: unthrottled ? 0 : undefined });

await app.waitUntilExit();
