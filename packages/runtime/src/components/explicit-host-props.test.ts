import { expect, test } from "vite-plus/test";
import { explicitHostProps } from "./explicit-host-props.ts";

const declarations = Object.freeze({
  borderTop: Boolean,
  width: [Number, String],
  wrap: String,
});

test("forwards only explicit declared props using Vue-resolved values", () => {
  const resolved = { borderTop: true, width: 20, wrap: "wrap" };

  expect(
    explicitHostProps(
      resolved,
      { "border-top": undefined, width: "20", key: "row", class: "ignored" },
      declarations,
    ),
  ).toEqual({ borderTop: true, width: 20 });
});

test("omits absent defaults and follows dynamic addition or removal", () => {
  const resolved = { borderTop: true, width: 20, wrap: "truncate" };

  expect(explicitHostProps(resolved, null, declarations)).toEqual({});
  expect(explicitHostProps(resolved, { wrap: "truncate" }, declarations)).toEqual({
    wrap: "truncate",
  });
  expect(explicitHostProps(resolved, {}, declarations)).toEqual({});
});
