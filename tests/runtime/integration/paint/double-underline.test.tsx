import { defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import { renderToString, Text } from "@vue-tui/runtime";

const E = "\u001b";

// Double underline arrives only from content another program produced; `<Text>`
// has no prop for it. `24m` ends both underline forms, so the two switch
// together rather than one closing the other.
test("double underline from pasted content survives to the output", () => {
  const App = defineComponent(() => () => <Text>{`${E}[21mtwo${E}[24mplain`}</Text>);
  expect(renderToString(App, { width: 10, color: "truecolor" })).toBe(`${E}[21mtwo${E}[24mplain`);
});

test("switching to double underline does not clear the fallback first", () => {
  const App = defineComponent(() => () => <Text>{`${E}[4mone${E}[21mtwo${E}[24mplain`}</Text>);
  expect(renderToString(App, { width: 20, color: "truecolor" })).toBe(
    `${E}[4mone${E}[21mtwo${E}[24mplain`,
  );
});
