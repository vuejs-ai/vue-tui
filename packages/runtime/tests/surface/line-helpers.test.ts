import ansiEscapes from "ansi-escapes";
import { expect, test } from "vite-plus/test";
import { nextLineEscape } from "../../src/surface/line-helpers.ts";

test("uses NEL rather than bottom-clamped CNL for an inline next line", () => {
  expect(nextLineEscape).toBe("\x1bE");
  expect(nextLineEscape).not.toBe(ansiEscapes.cursorNextLine);
});
