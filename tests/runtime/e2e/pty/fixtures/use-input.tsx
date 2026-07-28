import process from "node:process";
import { createApp, useApp, useInput } from "@vue-tui/runtime";
import { defineComponent, onMounted } from "vue";

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
        if (event.type === "key" && event.key.name === "down") {
          rapidDownArrowCount++;
          return;
        }
        if (event.type === "key" && event.key.name === "enter") {
          if (rapidDownArrowCount !== 3) {
            throw new Error(`Expected enter after 3 down arrows, received ${rapidDownArrowCount}`);
          }
          clearTimeout(rapidTimeout);
          exit();
          return;
        }
        throw new Error("Expected only down arrows and enter");
      }

      if (props.test === "lowercase") {
        if (event.type === "text" && event.text === "q") {
          exit();
          return;
        }
      }

      // A standalone Escape reaches this callback only after stdin ingress's
      // real disambiguation window expires; keep it as a PTY boundary sample.
      if (props.test === "escape") {
        if (event.type === "key" && event.key.name === "escape") {
          exit();
          return;
        }
      }

      if (
        props.test === "upArrow" &&
        event.type === "key" &&
        event.key.name === "up" &&
        !event.key.shift &&
        !event.key.alt &&
        !event.key.ctrl &&
        !event.key.meta &&
        !event.key.super &&
        !event.key.hyper
      ) {
        exit();
        return;
      }

      if (
        props.test === "ctrl" &&
        event.type === "key" &&
        event.key.character === "f" &&
        !event.key.shift &&
        !event.key.alt &&
        event.key.ctrl &&
        !event.key.meta &&
        !event.key.super &&
        !event.key.hyper
      ) {
        exit();
        return;
      }

      if (props.test === "dropUninterpreted") {
        if (event.type === "text" && event.text === "q") {
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
