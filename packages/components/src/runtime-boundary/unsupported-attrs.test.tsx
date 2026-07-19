import { expect, test } from "vite-plus/test";
import { renderToString } from "@vue-tui/runtime";
import UnsupportedBoxAttrTemplate from "./unsupported-box-attr.vue";

test("a compiled Vue template cannot silently use a removed Box prop", () => {
  expect(() => renderToString(UnsupportedBoxAttrTemplate)).toThrow(
    /<Box> does not accept the undeclared attribute "padding(?:X|-x)"/,
  );
});
