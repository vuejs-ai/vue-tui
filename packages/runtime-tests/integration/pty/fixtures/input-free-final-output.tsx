import process from "node:process";
import { INTERNAL_KITTY_KEYBOARD, type InternalMountOptions } from "@vue-tui/runtime/internal";
import { writeSync } from "node:fs";
import { createApp, Text } from "@vue-tui/runtime";
import { defineComponent, onMounted } from "vue";

const stdin = process.stdin as NodeJS.ReadStream & { isRaw?: boolean };
const rawModeCalls: boolean[] = [];
const refCalls: string[] = [];
const dataListenerTransitions: string[] = [];
const listenersBefore = stdin.listenerCount("data");
const originalSetRawMode = stdin.setRawMode?.bind(stdin);
const originalRef = stdin.ref?.bind(stdin);
const originalUnref = stdin.unref?.bind(stdin);

stdin.on("newListener", (event) => {
  if (event === "data") dataListenerTransitions.push("add");
});
stdin.on("removeListener", (event) => {
  if (event === "data") dataListenerTransitions.push("remove");
});

function ownershipState() {
  return {
    isTTY: stdin.isTTY === true,
    rawModeCalls,
    refCalls,
    dataListenerTransitions,
    dataListenerDelta: stdin.listenerCount("data") - listenersBefore,
    isRaw: stdin.isRaw === true,
  };
}

if (originalSetRawMode) {
  stdin.setRawMode = (mode: boolean) => {
    rawModeCalls.push(mode);
    return originalSetRawMode(mode);
  };
}
if (originalRef) {
  stdin.ref = () => {
    refCalls.push("ref");
    return originalRef();
  };
}
if (originalUnref) {
  stdin.unref = () => {
    refCalls.push("unref");
    return originalUnref();
  };
}

const App = defineComponent(() => {
  onMounted(() => {
    // The timer exposes the fully mounted state without introducing terminal
    // input demand. Once it fires, no ref remains to keep the process alive.
    setTimeout(() => {
      process.stdout.write(`__INPUT_FREE_MOUNT__${JSON.stringify(ownershipState())}\n`);
    }, 100);
  });

  return () => <Text>FINAL_OUTPUT_NO_INPUT</Text>;
});

const app = createApp(App);
process.on("exit", () => {
  writeSync(1, `__INPUT_FREE_EXIT__${JSON.stringify(ownershipState())}\n`);
});
app.mount({
  liveUpdates: false,
  patchConsole: false,
  [INTERNAL_KITTY_KEYBOARD]: { mode: "auto" },
} as InternalMountOptions);
await app.waitUntilExit();
