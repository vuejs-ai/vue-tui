import process from "node:process";
import { createApp, useApp, useInput } from "@vue-tui/runtime";
import { defineComponent, onMounted } from "vue";

const PasteDemo = defineComponent({
  props: {
    test: { type: String, default: undefined },
  },
  setup(props) {
    const { exit } = useApp();
    let receivedCount = 0;

    useInput((event) => {
      receivedCount++;
      if (event.type !== "paste") {
        throw new Error(`Expected one normalized paste event, received ${event.type}`);
      }

      if (props.test === "basic" && event.text === "hello world") {
        exit();
        return;
      }

      if (props.test === "escapeSequences" && event.text === "hello[Aworld") {
        exit();
        return;
      }

      if (props.test === "ctrlC" && event.text === "\x03") {
        process.stdout.write("__PASTE_CTRL_C__");
        exit();
        return;
      }

      if (props.test === "singleFact" && event.text === "hello") {
        setTimeout(() => {
          if (receivedCount === 1) exit();
          else exit(new Error(`Expected one paste fact, received ${receivedCount}`));
        }, 30);
        return;
      }

      throw new Error(`Unexpected paste payload: ${JSON.stringify(event.text)}`);
    });

    onMounted(() => {
      process.stdout.write("__READY__");
    });

    return () => null;
  },
});

const MultipleHooksDemo = defineComponent(() => {
  const { exit } = useApp();
  let receivedCount = 0;

  const register = () => {
    useInput((event) => {
      if (event.type !== "paste" || event.text !== "hello") {
        throw new Error(`Expected normalized paste, received ${JSON.stringify(event)}`);
      }
      receivedCount++;
      if (receivedCount === 2) exit();
    });
  };

  register();
  register();

  onMounted(() => {
    process.stdout.write("__READY__");
  });

  return () => null;
});

const test = process.argv[2];
const app = createApp(test === "multipleHooks" ? MultipleHooksDemo : PasteDemo, { test });
app.mount({ exitOnCtrlC: test === "ctrlC" });
await app.waitUntilExit();
console.log("exited");
