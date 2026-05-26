import process from "node:process";
import { createApp, useExit, useInput, usePaste } from "@vue-tui/runtime";
import { defineComponent, onMounted } from "vue";

const PasteDemo = defineComponent({
  props: {
    test: { type: String, default: undefined },
  },
  setup(props) {
    const exit = useExit();

    usePaste((text) => {
      if (props.test === "basic" && text === "hello world") {
        exit();
        return;
      }

      if (props.test === "escapeSequences" && text === "hello[Aworld") {
        exit();
        return;
      }

      if (props.test === "noUseInput" && text === "hello") {
        exit();
      }
    });

    useInput(
      (input) => {
        throw new Error(`useInput received input during paste: ${JSON.stringify(input)}`);
      },
      { isActive: props.test === "noUseInput" },
    );

    onMounted(() => {
      process.stdout.write("__READY__");
    });

    return () => null;
  },
});

const MultipleHooksDemo = defineComponent(() => {
  const exit = useExit();
  let receivedCount = 0;

  const onPaste = (text: string) => {
    if (text === "hello") {
      receivedCount++;
      if (receivedCount >= 2) {
        exit();
      }
    }
  };

  usePaste(onPaste);
  usePaste(onPaste);

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
