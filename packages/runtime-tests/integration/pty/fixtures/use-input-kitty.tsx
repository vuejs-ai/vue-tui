import process from "node:process";
import { createApp, useInput, useApp } from "@vue-tui/runtime";
import { defineComponent, onMounted } from "vue";

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

    useInput((input, key) => {
      if (props.test === "autoDetectionOnce") {
        autoDetectionInputs.push(input);
        if (input === "b") {
          setTimeout(() => {
            const observed = JSON.stringify(autoDetectionInputs);
            process.stdout.write(`__AUTO_INPUTS__:${observed}`);
            if (observed === '["a","b"]') exit();
            else exit(new Error(`unexpected auto-detection input: ${observed}`));
          }, 30);
        }
        return;
      }

      if (props.test === "super" && input === "s" && key.super) {
        exit();
        return;
      }

      if (props.test === "hyper" && input === "h" && key.hyper) {
        exit();
        return;
      }

      if (props.test === "capsLock" && key.capsLock) {
        exit();
        return;
      }

      if (props.test === "numLock" && key.numLock) {
        exit();
        return;
      }

      if (props.test === "superCtrl" && input === "s" && key.super && key.ctrl) {
        exit();
        return;
      }

      // Ctrl+Shift+C must NOT be treated as Ctrl+C exit (it's "copy" in many
      // terminals). Even with exitOnCtrlC on, the kitty protocol disambiguates
      // it (\x1b[99;6u -> input "c", ctrl+shift), so it must reach the handler.
      if (props.test === "ctrlShiftC" && input === "c" && key.ctrl && key.shift) {
        process.stdout.write("__CTRL_SHIFT_C__");
        exit();
        return;
      }

      if (props.test === "press" && key.eventType === "press") {
        exit();
        return;
      }

      if (props.test === "repeat" && key.eventType === "repeat") {
        exit();
        return;
      }

      // Ink (use-input.ts:204-217) has no release special-case: a printable
      // 'a' release ('a' up, CSI 97;1:3 u) delivers input "a", not "".
      // Asserting input === "a" here (not just eventType) is what guards against
      // the old undocumented divergence that blanked input on release.
      if (props.test === "release" && input === "a" && key.eventType === "release") {
        exit();
        return;
      }

      if (props.test === "escape" && key.escape && input === "") {
        exit();
        return;
      }

      if (props.test === "backspace" && key.backspace && input === "") {
        exit();
        return;
      }

      if (props.test === "delete" && key.delete && input === "") {
        exit();
        return;
      }

      if (props.test === "capslock-empty" && input === "") {
        exit();
        return;
      }

      if (props.test === "f13-empty" && input === "") {
        exit();
        return;
      }

      if (props.test === "printscreen-empty" && input === "") {
        exit();
        return;
      }

      if (props.test === "space" && input === " ") {
        exit();
        return;
      }

      if (props.test === "return" && input === "\r") {
        exit();
        return;
      }

      if (props.test === "ctrlLetter" && input === "a" && key.ctrl) {
        exit();
        return;
      }

      if (props.test === "queryResponse") {
        throw new Error("Query response should not reach handler");
      }

      if (props.test === "queryThenKey") {
        if (input === "a") {
          exit();
          return;
        }
        throw new Error(`queryThenKey: expected input="a", got input="${input}"`);
      }

      throw new Error(`Unexpected input for test "${props.test}": input="${input}"`);
    });

    return () => null;
  },
});

const testName = process.argv[2];

if (testName === "kittyCtrlCExit" || testName === "ctrlShiftC") {
  const app = createApp(KittyInput, { test: testName });
  app.mount({ exitOnCtrlC: true });
  await app.waitUntilExit();
  console.log("exited");
} else if (testName === "autoDetectionOnce") {
  const app = createApp(KittyInput, { test: testName });
  app.mount({ exitOnCtrlC: false, kittyKeyboard: { mode: "auto" } });
  await app.waitUntilExit();
  console.log("exited");
} else {
  const app = createApp(KittyInput, { test: testName });
  app.mount({ exitOnCtrlC: false });
  await app.waitUntilExit();
  console.log("exited");
}
