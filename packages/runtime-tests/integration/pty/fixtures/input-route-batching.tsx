import process from "node:process";
import { Box, Text, createApp, useApp, useFocus, useInput, type Key } from "@vue-tui/runtime";
import { defineComponent, h, onMounted, shallowRef } from "vue";

const requestedMode = process.argv[2] === "fullscreen" ? "fullscreen" : "inline";
const assertionRun = process.argv[3] === "assert";

const App = defineComponent(() => {
  const { exit } = useApp();
  const activeB = shallowRef(true);
  const activeC = shallowRef(false);
  const calls = shallowRef<readonly string[]>([]);
  const defaultObservation = shallowRef("No default-order input yet");
  const first = useFocus({ id: "first", autoFocus: true });
  const second = useFocus({ id: "second" });
  const currentFocus = () =>
    first.isFocused.value ? "first" : second.isFocused.value ? "second" : "none";
  const record = (value: string) => {
    calls.value = [...calls.value, value];
  };
  const label = (input: string, key: Key) => (key.backspace ? "Backspace" : input);

  useInput((input, key) => {
    if (key.tab) defaultObservation.value = `Tab handler saw focus ${currentFocus()}`;
    if (key.escape) defaultObservation.value = `Escape handler saw focus ${currentFocus()}`;
    record(`A:${label(input, key)}`);
    if (input === "x") {
      activeB.value = false;
      activeC.value = true;
    }
    if (input === "q") exit();
  });
  useInput((input, key) => record(`B:${label(input, key)}`), { isActive: activeB });
  useInput(
    (input, key) => {
      record(`C:${label(input, key)}`);
      if (assertionRun && key.backspace) exit();
    },
    { isActive: activeC },
  );

  onMounted(() => {
    if (assertionRun) process.stdout.write("__READY__");
  });

  return () =>
    h(
      Box,
      { flexDirection: "column", borderStyle: "round", width: 70 },
      {
        default: () => [
          h(Text, { bold: true }, { default: () => "Input route batching" }),
          h(Text, null, { default: () => `Route ${activeB.value ? "B" : "C"} active` }),
          h(Text, null, {
            default: () => "Send x+Backspace, then Tab, Escape, and q",
          }),
          h(Text, null, { default: () => `Focus now ${currentFocus()}` }),
          h(Text, null, { default: () => defaultObservation.value }),
          h(Text, null, {
            default: () => (calls.value.length === 0 ? "No input yet" : calls.value.join(" | ")),
          }),
        ],
      },
    );
});

const app = createApp(App);
app.mount({ mode: requestedMode, exitOnCtrlC: false, maxFps: 0, patchConsole: false });
await app.waitUntilExit();
if (assertionRun) process.stdout.write("__ROUTE_BATCHING_OK__");
