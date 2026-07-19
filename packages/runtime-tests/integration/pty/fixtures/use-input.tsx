import process from "node:process";
import { createApp, useApp, useInput, type TuiInputEvent, type TuiKeyName } from "@vue-tui/runtime";
import { defineComponent, onMounted } from "vue";

interface KeyExpectation {
  readonly name: TuiKeyName;
  readonly shift?: boolean;
  readonly alt?: boolean;
  readonly ctrl?: boolean;
}

interface CharacterExpectation {
  readonly character: string;
  readonly shift?: boolean;
  readonly alt?: boolean;
  readonly ctrl?: boolean;
}

const namedKeyExpectations: Readonly<Record<string, KeyExpectation>> = {
  enter: { name: "enter" },
  escape: { name: "escape" },
  altBackspace: { name: "backspace", alt: true },
  altEnter: { name: "enter", alt: true },
  upArrow: { name: "up" },
  downArrow: { name: "down" },
  leftArrow: { name: "left" },
  rightArrow: { name: "right" },
  upArrowAlt: { name: "up", alt: true },
  downArrowAlt: { name: "down", alt: true },
  leftArrowAlt: { name: "left", alt: true },
  rightArrowAlt: { name: "right", alt: true },
  upArrowCtrl: { name: "up", ctrl: true },
  downArrowCtrl: { name: "down", ctrl: true },
  leftArrowCtrl: { name: "left", ctrl: true },
  rightArrowCtrl: { name: "right", ctrl: true },
  pageDown: { name: "page-down" },
  pageUp: { name: "page-up" },
  home: { name: "home" },
  end: { name: "end" },
  tab: { name: "tab" },
  shiftTab: { name: "tab", shift: true },
  backspace: { name: "backspace" },
  delete: { name: "delete" },
};

const characterExpectations: Readonly<Record<string, CharacterExpectation>> = {
  ctrl: { character: "f", ctrl: true },
  alt: { character: "m", alt: true },
};

function hasModifiers(
  event: Extract<TuiInputEvent, { readonly kind: "key" }>,
  expected: { readonly shift?: boolean; readonly alt?: boolean; readonly ctrl?: boolean },
): boolean {
  return (
    event.shift === (expected.shift ?? false) &&
    event.alt === (expected.alt ?? false) &&
    event.ctrl === (expected.ctrl ?? false)
  );
}

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
      if (props.test === "rapidArrowsEnter") {
        if (event.kind === "key" && event.name === "down") {
          rapidDownArrowCount++;
          return;
        }
        if (event.kind === "key" && event.name === "enter") {
          if (rapidDownArrowCount !== 3) {
            throw new Error(`Expected enter after 3 down arrows, received ${rapidDownArrowCount}`);
          }
          clearTimeout(rapidTimeout);
          exit();
          return;
        }
        throw new Error("Expected only down arrows and enter");
      }

      if (props.test === "lowercase" || props.test === "uppercase") {
        const expected = props.test === "lowercase" ? "q" : "Q";
        if (event.kind === "text" && event.text === expected) {
          exit();
          return;
        }
      }

      if (
        props.test === "pastedCarriageReturn" ||
        props.test === "pastedTab" ||
        props.test === "bracketedPaste"
      ) {
        const expected =
          props.test === "pastedCarriageReturn"
            ? "\rtest"
            : props.test === "pastedTab"
              ? "\ttest"
              : "hello";
        if (event.kind === "paste" && event.text === expected) {
          exit();
          return;
        }
      }

      const namedExpectation = namedKeyExpectations[props.test ?? ""];
      if (
        namedExpectation &&
        event.kind === "key" &&
        event.name === namedExpectation.name &&
        hasModifiers(event, namedExpectation)
      ) {
        exit();
        return;
      }

      const characterExpectation = characterExpectations[props.test ?? ""];
      if (
        characterExpectation &&
        event.kind === "key" &&
        event.character === characterExpectation.character &&
        hasModifiers(event, characterExpectation)
      ) {
        exit();
        return;
      }

      if (props.test === "dropUnsupported" || props.test === "dropUninterpreted") {
        if (event.kind === "text" && event.text === "q") {
          exit();
          return;
        }
        throw new Error(
          `Expected unsupported input to be dropped, received ${JSON.stringify(event)}`,
        );
      }

      throw new Error(`Unexpected normalized input: ${JSON.stringify(event)}`);
    });

    return () => null;
  },
});

const app = createApp(UserInput, { test: process.argv[2] });
app.mount();
await app.waitUntilExit();
console.log("exited");
