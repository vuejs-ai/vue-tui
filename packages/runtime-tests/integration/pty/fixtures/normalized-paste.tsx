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
      if (event.kind !== "paste") {
        throw new Error(`Expected one normalized paste event, received ${event.kind}`);
      }

      if (props.test === "basic" && event.text === "hello world") {
        exit();
        return "consume";
      }

      if (props.test === "escapeSequences" && event.text === "hello[Aworld") {
        exit();
        return "consume";
      }

      if (props.test === "singleFact" && event.text === "hello") {
        setTimeout(() => {
          if (receivedCount === 1) exit();
          else exit(new Error(`Expected one paste fact, received ${receivedCount}`));
        }, 30);
        return "consume";
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
      if (event.kind !== "paste" || event.text !== "hello") {
        throw new Error(`Expected normalized paste, received ${JSON.stringify(event)}`);
      }
      receivedCount++;
      if (receivedCount === 2) exit();
      return "consume";
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
app.mount();
await app.waitUntilExit();
console.log("exited");
