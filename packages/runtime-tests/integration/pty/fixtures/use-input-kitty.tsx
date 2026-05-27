import process from "node:process";
import { createApp, useInput, useExit } from "@vue-tui/runtime";
import { defineComponent, onMounted } from "vue";

const KittyInput = defineComponent({
  props: {
    test: { type: String, default: undefined },
  },
  setup(props) {
    const exit = useExit();

    onMounted(() => {
      process.stdout.write("__READY__");
    });

    useInput((input, key) => {
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

      if (props.test === "press" && key.eventType === "press") {
        exit();
        return;
      }

      if (props.test === "repeat" && key.eventType === "repeat") {
        exit();
        return;
      }

      if (props.test === "release" && key.eventType === "release") {
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

if (testName === "kittyCtrlCExit") {
  const app = createApp(KittyInput, { test: testName });
  app.mount({ exitOnCtrlC: true });
  await app.waitUntilExit();
  console.log("exited");
} else {
  const app = createApp(KittyInput, { test: testName });
  app.mount({ exitOnCtrlC: false });
  await app.waitUntilExit();
  console.log("exited");
}
