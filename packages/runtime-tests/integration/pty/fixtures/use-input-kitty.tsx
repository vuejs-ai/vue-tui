import process from "node:process";
import { createApp, useInput, useApp } from "@vue-tui/runtime";
import { defineComponent, onMounted } from "vue";
import { inputText, isKey } from "./input-event.js";

const KittyInput = defineComponent({
  props: {
    test: { type: String, default: undefined },
  },
  setup(props) {
    const { exit } = useApp();
    const autoDetectionInputs: string[] = [];

    onMounted(() => {
      process.stdout.write("__READY__");
    });

    useInput((event) => {
      const input = inputText(event);
      const key = event.kind === "key" ? event.key : null;

      if (props.test === "autoDetectionOnce") {
        if (input === null) throw new Error(`Expected text input, received ${event.kind}`);
        autoDetectionInputs.push(input);
        if (input === "b") {
          setTimeout(() => {
            const observed = JSON.stringify(autoDetectionInputs);
            process.stdout.write(`__AUTO_INPUTS__:${observed}`);
            if (observed === '["a","b"]') exit();
            else exit(new Error(`unexpected auto-detection input: ${observed}`));
          }, 30);
        }
        return "continue";
      }

      if (props.test === "super" && isKey(event, "s") && key?.modifiers.super) {
        exit();
        return "consume";
      }

      if (props.test === "hyper" && isKey(event, "h") && key?.modifiers.hyper) {
        exit();
        return "consume";
      }

      if (props.test === "capsLock" && key?.modifiers.capsLock) {
        exit();
        return "consume";
      }

      if (props.test === "numLock" && key?.modifiers.numLock) {
        exit();
        return "consume";
      }

      if (
        props.test === "superCtrl" &&
        isKey(event, "s") &&
        key?.modifiers.super &&
        key.modifiers.ctrl
      ) {
        exit();
        return "consume";
      }

      // Ctrl+Shift+C must NOT be treated as Ctrl+C exit (it's "copy" in many
      // terminals). The kitty protocol disambiguates it from Ctrl+C, so the
      // framework's delayed Ctrl+C default must not run.
      if (
        props.test === "ctrlShiftC" &&
        isKey(event, "c") &&
        key?.modifiers.ctrl &&
        key.modifiers.shift
      ) {
        process.stdout.write("__CTRL_SHIFT_C__");
        exit();
        return "consume";
      }

      if (
        props.test === "kittyCtrlCExit" &&
        isKey(event, "c") &&
        key?.modifiers.ctrl &&
        !key.modifiers.shift
      ) {
        process.stdout.write("__CTRL_C_HANDLER__");
        return "continue";
      }

      if (props.test === "press" && key?.phase === "press") {
        exit();
        return "consume";
      }

      if (props.test === "repeat" && key?.phase === "repeat") {
        exit();
        return "consume";
      }

      // A release preserves both its phase and printable codepoint.
      if (
        props.test === "release" &&
        isKey(event, "a") &&
        key?.phase === "release" &&
        key.primaryCodepoint === 97
      ) {
        exit();
        return "consume";
      }

      if (props.test === "escape" && isKey(event, "escape") && !key?.printable) {
        exit();
        return "consume";
      }

      if (props.test === "backspace" && isKey(event, "backspace") && !key?.printable) {
        exit();
        return "consume";
      }

      if (props.test === "delete" && isKey(event, "delete") && !key?.printable) {
        exit();
        return "consume";
      }

      if (props.test === "capslock-empty" && isKey(event, "capslock") && !key?.printable) {
        exit();
        return "consume";
      }

      if (props.test === "f13-empty" && isKey(event, "f13") && !key?.printable) {
        exit();
        return "consume";
      }

      if (props.test === "printscreen-empty" && isKey(event, "printscreen") && !key?.printable) {
        exit();
        return "consume";
      }

      if (
        props.test === "space" &&
        isKey(event, "space") &&
        key?.printable &&
        key.primaryCodepoint === 32
      ) {
        exit();
        return "consume";
      }

      if (props.test === "return" && isKey(event, "return")) {
        exit();
        return "consume";
      }

      if (props.test === "ctrlLetter" && isKey(event, "a") && key?.modifiers.ctrl) {
        exit();
        return "consume";
      }

      if (props.test === "queryResponse") {
        throw new Error("Query response should not reach handler");
      }

      if (props.test === "queryThenKey") {
        if (input === "a") {
          exit();
          return "consume";
        }
        throw new Error(`queryThenKey: expected input="a", got input="${input}"`);
      }

      throw new Error(
        `Unexpected input for test "${props.test}": ${JSON.stringify({ event, input })}`,
      );
    });

    return () => null;
  },
});

const testName = process.argv[2];

if (testName === "kittyCtrlCExit" || testName === "ctrlShiftC") {
  const app = createApp(KittyInput, { test: testName });
  app.mount();
  await app.waitUntilExit();
  console.log("exited");
} else if (testName === "autoDetectionOnce") {
  const app = createApp(KittyInput, { test: testName });
  app.mount({ kittyKeyboard: { mode: "auto" } });
  await app.waitUntilExit();
  console.log("exited");
} else {
  const app = createApp(KittyInput, { test: testName });
  app.mount();
  await app.waitUntilExit();
  console.log("exited");
}
