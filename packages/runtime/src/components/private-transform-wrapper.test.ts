import { Comment, defineComponent, h } from "vue";
import { expect, test } from "vite-plus/test";
import { renderToString } from "../render-to-string.ts";
import { Transform } from "./transform.ts";

type EmptySlotCase = {
  name: string;
  slots?: { default: () => unknown[] };
};

const emptySlotCases: EmptySlotCase[] = [
  { name: "an absent slot" },
  { name: "an all-comment slot", slots: { default: () => [h(Comment)] } },
  { name: "an empty slot array", slots: { default: () => [] } },
];

test.each(emptySlotCases)("source-private Transform omits its host node for $name", ({ slots }) => {
  const App = defineComponent(
    () => () =>
      h("tui-box", { flexDirection: "row", gap: 2 }, [
        h("tui-text", null, "a"),
        h(Transform, { transform: (line: string) => line }, slots),
        h("tui-text", null, "b"),
      ]),
  );

  expect(renderToString(App, { width: 20 })).toBe("a  b");
});
