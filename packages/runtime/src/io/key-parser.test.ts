import { expect, test } from "vite-plus/test";
import { parseKey } from "./key-parser.ts";

test("Shift+Tab (\\x1b[Z) sets tab=true and shift=true", () => {
  const result = parseKey("\x1b[Z");
  expect(result.input).toBe("");
  expect(result.key.tab).toBe(true);
  expect(result.key.shift).toBe(true);
});

test("plain Tab (\\t) sets tab=true, shift=false", () => {
  const result = parseKey("\t");
  expect(result.input).toBe("");
  expect(result.key.tab).toBe(true);
  expect(result.key.shift).toBe(false);
});
