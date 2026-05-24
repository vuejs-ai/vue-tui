import { expect, test } from "vite-plus/test";
import { isYogaProp } from "./yoga.ts";

test("isYogaProp recognises layout props and rejects style props", () => {
  expect(isYogaProp("padding")).toBe(true);
  expect(isYogaProp("flexDirection")).toBe(true);
  expect(isYogaProp("color")).toBe(false);
  expect(isYogaProp("bold")).toBe(false);
});
