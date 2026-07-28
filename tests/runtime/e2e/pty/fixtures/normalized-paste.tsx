import process from "node:process";
import { createApp, useApp, useInput } from "@vue-tui/runtime";
import { defineComponent, onMounted } from "vue";

const PasteDemo = defineComponent({
  props: {
    test: { type: String, default: undefined },
  },
  setup(props) {
    const { exit } = useApp();

    useInput((event) => {
      if (event.type !== "paste") {
        throw new Error(`Expected one normalized paste event, received ${event.type}`);
      }

      if (props.test === "basic" && event.text === "hello world") {
        exit();
        return;
      }

      if (props.test === "ctrlC" && event.text === "\x03") {
        process.stdout.write("__PASTE_CTRL_C__");
        exit();
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

const test = process.argv[2];
const app = createApp(PasteDemo, { test });
app.mount({ exitOnCtrlC: test === "ctrlC" });
await app.waitUntilExit();
console.log("exited");
