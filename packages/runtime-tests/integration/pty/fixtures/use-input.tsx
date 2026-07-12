import process from "node:process";
import { createApp, useInput, useApp } from "@vue-tui/runtime";
import { defineComponent, onMounted } from "vue";
import { inputText, isKey } from "./input-event.js";

const UserInput = defineComponent({
  props: {
    test: { type: String, default: undefined },
  },
  setup(props) {
    const { exit } = useApp();
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

    useInput((event) => {
      const text = inputText(event);
      const key = event.kind === "key" ? event.key : null;

      if (props.test === "rapidArrowsEnter") {
        if (isKey(event, "down")) {
          rapidDownArrowCount++;
          return "consume";
        }

        if (isKey(event, "return")) {
          if (rapidDownArrowCount === 3) {
            clearTimeout(rapidTimeout);
            exit();
            return "consume";
          }

          throw new Error(`Expected enter after 3 down arrows, received ${rapidDownArrowCount}`);
        }

        throw new Error("Expected only down arrows and enter");
      }

      if (props.test === "lowercase" && event.kind === "text" && event.text === "q") {
        exit();
        return "consume";
      }

      if (props.test === "uppercase" && event.kind === "text" && event.text === "Q") {
        exit();
        return "consume";
      }

      if (props.test === "uppercase" && isKey(event, "return") && !key?.modifiers.shift) {
        exit();
        return "consume";
      }

      if (
        props.test === "pastedCarriageReturn" &&
        event.kind === "paste" &&
        event.text === "\rtest"
      ) {
        exit();
        return "consume";
      }

      if (props.test === "pastedTab" && event.kind === "paste" && event.text === "\ttest") {
        exit();
        return "consume";
      }

      if (props.test === "bracketedPaste" && event.kind === "paste" && event.text === "hello") {
        exit();
        return "consume";
      }

      if (props.test === "escape" && isKey(event, "escape")) {
        exit();
        return "consume";
      }

      if (props.test === "escapeNoMeta" && isKey(event, "escape") && !key?.modifiers.meta) {
        exit();
        return "consume";
      }

      if (props.test === "ctrl" && isKey(event, "f") && key?.modifiers.ctrl) {
        exit();
        return "consume";
      }

      if (props.test === "meta" && isKey(event, "m") && key?.modifiers.meta) {
        exit();
        return "consume";
      }

      if (props.test === "metaBackspace" && isKey(event, "backspace") && key?.modifiers.meta) {
        exit();
        return "consume";
      }

      if (
        props.test === "escapeBracketPrefix" &&
        event.kind === "uninterpreted" &&
        event.sequence === "\x1b["
      ) {
        exit();
        return "consume";
      }

      if (
        props.test === "metaUpperO" &&
        isKey(event, "o") &&
        key?.modifiers.meta &&
        key.modifiers.shift
      ) {
        exit();
        return "consume";
      }

      if (props.test === "upArrow" && isKey(event, "up") && !key?.modifiers.meta) {
        exit();
        return "consume";
      }

      if (props.test === "downArrow" && isKey(event, "down") && !key?.modifiers.meta) {
        exit();
        return "consume";
      }

      if (props.test === "leftArrow" && isKey(event, "left") && !key?.modifiers.meta) {
        exit();
        return "consume";
      }

      if (props.test === "rightArrow" && isKey(event, "right") && !key?.modifiers.meta) {
        exit();
        return "consume";
      }

      if (props.test === "upArrowMeta" && isKey(event, "up") && key?.modifiers.meta) {
        exit();
        return "consume";
      }

      if (props.test === "downArrowMeta" && isKey(event, "down") && key?.modifiers.meta) {
        exit();
        return "consume";
      }

      if (props.test === "leftArrowMeta" && isKey(event, "left") && key?.modifiers.meta) {
        exit();
        return "consume";
      }

      if (props.test === "rightArrowMeta" && isKey(event, "right") && key?.modifiers.meta) {
        exit();
        return "consume";
      }

      if (props.test === "upArrowCtrl" && isKey(event, "up") && key?.modifiers.ctrl) {
        exit();
        return "consume";
      }

      if (props.test === "downArrowCtrl" && isKey(event, "down") && key?.modifiers.ctrl) {
        exit();
        return "consume";
      }

      if (props.test === "leftArrowCtrl" && isKey(event, "left") && key?.modifiers.ctrl) {
        exit();
        return "consume";
      }

      if (props.test === "rightArrowCtrl" && isKey(event, "right") && key?.modifiers.ctrl) {
        exit();
        return "consume";
      }

      if (props.test === "pageDown" && isKey(event, "pagedown") && !key?.modifiers.meta) {
        exit();
        return "consume";
      }

      if (props.test === "pageUp" && isKey(event, "pageup") && !key?.modifiers.meta) {
        exit();
        return "consume";
      }

      if (props.test === "home" && isKey(event, "home") && !key?.modifiers.meta) {
        exit();
        return "consume";
      }

      if (props.test === "end" && isKey(event, "end") && !key?.modifiers.meta) {
        exit();
        return "consume";
      }

      if (props.test === "tab" && isKey(event, "tab") && !key?.modifiers.ctrl) {
        exit();
        return "consume";
      }

      if (props.test === "shiftTab" && isKey(event, "tab") && key?.modifiers.shift) {
        exit();
        return "consume";
      }

      if (props.test === "backspace" && isKey(event, "backspace")) {
        exit();
        return "consume";
      }

      if (props.test === "delete" && isKey(event, "delete")) {
        exit();
        return "consume";
      }

      if (props.test === "remove" && isKey(event, "delete")) {
        exit();
        return "consume";
      }

      if (props.test === "returnMeta" && isKey(event, "return") && key?.modifiers.meta) {
        exit();
        return "consume";
      }

      if (props.test === "ctrlF1" && isKey(event, "f1") && key?.modifiers.ctrl) {
        exit();
        return "consume";
      }

      if (
        props.test === "unmappedCtrlSequence" &&
        event.kind === "key" &&
        event.key.name === null &&
        event.key.modifiers.ctrl
      ) {
        exit();
        return "consume";
      }

      throw new Error(`Unexpected normalized input: ${JSON.stringify({ event, text })}`);
    });

    return () => null;
  },
});

const app = createApp(UserInput, { test: process.argv[2] });
app.mount();
await app.waitUntilExit();
console.log("exited");
