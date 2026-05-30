import process from "node:process";
import { createApp, useInput, useAppContext } from "@vue-tui/runtime";
import { defineComponent, onMounted } from "vue";

const UserInput = defineComponent({
  props: {
    test: { type: String, default: undefined },
  },
  setup(props) {
    const { exit } = useAppContext();
    let rapidDownArrowCount = 0;
    let rapidTimeout: ReturnType<typeof setTimeout> | undefined;

    onMounted(() => {
      if (props.test === "rapidArrowsEnter") {
        rapidTimeout = setTimeout(() => {
          throw new Error(
            `Expected 3 down arrows and enter, received ${rapidDownArrowCount} down arrow events`,
          );
        }, 6000);
      }

      process.stdout.write("__READY__");
    });

    useInput((input, key) => {
      if (props.test === "rapidArrowsEnter") {
        if (key.downArrow) {
          rapidDownArrowCount++;
          return;
        }

        if (key.return) {
          if (rapidDownArrowCount === 3) {
            clearTimeout(rapidTimeout);
            exit();
            return;
          }

          throw new Error(`Expected enter after 3 down arrows, received ${rapidDownArrowCount}`);
        }

        throw new Error("Expected only down arrows and enter");
      }

      if (props.test === "lowercase" && input === "q") {
        exit();
        return;
      }

      if (props.test === "uppercase" && input === "Q" && key.shift) {
        exit();
        return;
      }

      if (props.test === "uppercase" && input === "\r" && !key.shift) {
        exit();
        return;
      }

      if (props.test === "pastedCarriageReturn" && input === "\rtest") {
        exit();
        return;
      }

      if (props.test === "pastedTab" && input === "\ttest") {
        exit();
        return;
      }

      if (props.test === "bracketedPaste" && input === "hello") {
        exit();
        return;
      }

      if (props.test === "escape" && key.escape) {
        exit();
        return;
      }

      if (props.test === "escapeNoMeta" && key.escape && !key.meta) {
        exit();
        return;
      }

      if (props.test === "ctrl" && input === "f" && key.ctrl) {
        exit();
        return;
      }

      if (props.test === "meta" && input === "m" && key.meta) {
        exit();
        return;
      }

      if (props.test === "metaBackspace" && input === "" && key.meta && key.backspace) {
        exit();
        return;
      }

      if (props.test === "escapeBracketPrefix" && input === "[" && !key.meta) {
        exit();
        return;
      }

      if (props.test === "metaUpperO" && input === "O" && key.meta) {
        exit();
        return;
      }

      if (props.test === "upArrow" && key.upArrow && !key.meta) {
        exit();
        return;
      }

      if (props.test === "downArrow" && key.downArrow && !key.meta) {
        exit();
        return;
      }

      if (props.test === "leftArrow" && key.leftArrow && !key.meta) {
        exit();
        return;
      }

      if (props.test === "rightArrow" && key.rightArrow && !key.meta) {
        exit();
        return;
      }

      if (props.test === "upArrowMeta" && key.upArrow && key.meta) {
        exit();
        return;
      }

      if (props.test === "downArrowMeta" && key.downArrow && key.meta) {
        exit();
        return;
      }

      if (props.test === "leftArrowMeta" && key.leftArrow && key.meta) {
        exit();
        return;
      }

      if (props.test === "rightArrowMeta" && key.rightArrow && key.meta) {
        exit();
        return;
      }

      if (props.test === "upArrowCtrl" && key.upArrow && key.ctrl) {
        exit();
        return;
      }

      if (props.test === "downArrowCtrl" && key.downArrow && key.ctrl) {
        exit();
        return;
      }

      if (props.test === "leftArrowCtrl" && key.leftArrow && key.ctrl) {
        exit();
        return;
      }

      if (props.test === "rightArrowCtrl" && key.rightArrow && key.ctrl) {
        exit();
        return;
      }

      if (props.test === "pageDown" && key.pageDown && !key.meta) {
        exit();
        return;
      }

      if (props.test === "pageUp" && key.pageUp && !key.meta) {
        exit();
        return;
      }

      if (props.test === "home" && key.home && !key.meta) {
        exit();
        return;
      }

      if (props.test === "end" && key.end && !key.meta) {
        exit();
        return;
      }

      if (props.test === "tab" && input === "" && key.tab && !key.ctrl) {
        exit();
        return;
      }

      if (props.test === "shiftTab" && input === "" && key.tab && key.shift) {
        exit();
        return;
      }

      if (props.test === "backspace" && input === "" && key.backspace) {
        exit();
        return;
      }

      if (props.test === "delete" && input === "" && key.delete) {
        exit();
        return;
      }

      if (props.test === "remove" && input === "" && key.delete) {
        exit();
        return;
      }

      if (props.test === "returnMeta" && key.return && key.meta) {
        exit();
        return;
      }

      if (props.test === "ctrlF1" && input === "" && key.ctrl) {
        exit();
        return;
      }

      if (props.test === "unmappedCtrlSequence" && input === "" && key.ctrl) {
        exit();
        return;
      }

      throw new Error("Crash");
    });

    return () => null;
  },
});

const app = createApp(UserInput, { test: process.argv[2] });
app.mount();
await app.waitUntilExit();
console.log("exited");
