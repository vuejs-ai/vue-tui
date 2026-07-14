import process from "node:process";
import { Box, Text, createApp, useApp, useInput, type TuiInputEvent } from "@vue-tui/runtime";
import { useTextSelection, type TextSelectionMove } from "@vue-tui/runtime/fullscreen";
import { defineComponent, h, onMounted, shallowRef, type ComponentPublicInstance } from "vue";

const assertionRun = process.argv[2] === "assert";
const document = [
  "alpha 你🙂 beta gamma delta",
  "second e\u0301 line for selection",
  ...Array.from(
    { length: 80 },
    (_, index) => `job-${index.toString().padStart(3, "0")} completed with stable output`,
  ),
].join("\n");

function preview(text: string): string {
  if (text.length <= 32) return JSON.stringify(text);
  return `${JSON.stringify(text.slice(0, 24))}… (${text.length} code units)`;
}

function keyboardMove(event: TuiInputEvent): TextSelectionMove | null {
  if (event.kind !== "key" || event.key.phase === "release") return null;
  switch (event.key.name) {
    case "left":
      return "backward";
    case "right":
      return "forward";
    case "up":
      return "up";
    case "down":
      return "down";
    case "home":
      return "line-start";
    case "end":
      return "line-end";
    default:
      return null;
  }
}

const App = defineComponent(() => {
  const { exit } = useApp();
  const target = shallowRef<ComponentPublicInstance | null>(null);
  const selection = useTextSelection(target);
  const lastAction = shallowRef("ready");
  const copyResult = shallowRef("not-requested");

  const requestCopy = (): void => {
    copyResult.value = "pending";
    void selection.copy().then((result) => {
      copyResult.value =
        result.status === "empty" ? "empty" : `${result.status} text=${preview(result.text)}`;
    });
  };

  useInput((event) => {
    const move = keyboardMove(event);
    if (move) {
      const extend = event.kind === "key" && event.key.modifiers.shift;
      const changed = selection.move(move, { extend });
      lastAction.value = `${extend ? "extend" : "move"}:${move}:${changed ? "changed" : "unchanged"}`;
      return "consume";
    }

    if (
      event.kind === "key" &&
      event.key.name === "c" &&
      event.key.modifiers.ctrl &&
      event.key.modifiers.shift
    ) {
      lastAction.value = "copy:ctrl-shift-c";
      requestCopy();
      return "consume";
    }

    if (event.kind !== "text") return "continue";
    switch (event.text) {
      case "a":
        lastAction.value = `select-all:${selection.selectAll() ? "changed" : "unchanged"}`;
        return "consume";
      case "c":
        lastAction.value = "copy:c";
        requestCopy();
        return "consume";
      case "x":
        lastAction.value = `clear:${selection.clear() ? "changed" : "unchanged"}`;
        copyResult.value = "not-requested";
        return "consume";
      case "q":
        lastAction.value = "exit:q";
        exit();
        return "consume";
      default:
        return "continue";
    }
  });

  onMounted(() => {
    if (!assertionRun) return;
    // The marker is intentionally PTY-test-only. Visual review waits for the
    // rendered title so its alternate-screen observation stays uncluttered.
    setTimeout(() => process.stdout.write("__READY__"), 50);
  });

  return () => {
    const state = selection.state.value;
    const range = state.range ? `${state.range.anchor}->${state.range.extent}` : "none";
    return h(
      Box,
      { width: 72, height: 24, flexDirection: "column" },
      {
        default: () => [
          h(Text, { bold: true }, () => "Fullscreen selection and OSC 52 copy"),
          h(
            Text,
            null,
            () => "Shift+Arrows extend | Ctrl+Shift+C/c copy | a all | x clear | q quit",
          ),
          h(
            Text,
            null,
            () =>
              `selection=${state.status} range=${range} selected=${preview(state.selectedText)}`,
          ),
          h(Text, null, () => `copy=${copyResult.value}`),
          h(
            Text,
            { dimColor: true },
            () => `document=${document.length} code units; visible excerpt:`,
          ),
          h(Box, { width: 18, height: 8, flexShrink: 0, overflow: "hidden" }, () =>
            h(Text, { ref: target }, () => document),
          ),
          h(Text, null, () => `last=${lastAction.value}`),
        ],
      },
    );
  };
});

const app = createApp(App);
app.mount({
  mode: "fullscreen",
  maxFps: 0,
  patchConsole: false,
  kittyKeyboard: { mode: "enabled" },
  clipboard: { kind: "osc52" },
});
await app.waitUntilExit();
if (assertionRun) process.stdout.write("__SELECTION_COPY_OK__");
