import { describe, expect, test } from "vite-plus/test";
import { OutputCaches } from "./paint.ts";

describe("paint output caches", () => {
  test("reuses styled graphemes only for the exact rendered line", () => {
    const caches = new OutputCaches();
    const plain = caches.getStyledChars("red");
    const ansi = caches.getStyledChars("\x1b[31mred\x1b[0m");

    expect(caches.getStyledChars("red")).toBe(plain);
    expect(caches.getStyledChars("\x1b[31mred\x1b[0m")).toBe(ansi);
    expect(ansi).not.toBe(plain);
  });

  test("touches entries on a hit before evicting the least recently used line", () => {
    const caches = new OutputCaches({ styledEntries: 2, styledUnits: 100 });
    const firstA = caches.getStyledChars("a");
    const firstB = caches.getStyledChars("b");

    expect(caches.getStyledChars("a")).toBe(firstA);
    caches.getStyledChars("c");

    expect(caches.getStyledChars("b")).not.toBe(firstB);
  });

  test("does not retain a line larger than the styled cache budget", () => {
    const caches = new OutputCaches({ styledEntries: 10, styledUnits: 5 });
    const first = caches.getStyledChars("abcdef");

    expect(caches.getStyledChars("abcdef")).not.toBe(first);
  });

  test("drops retained entries when cleared", () => {
    const caches = new OutputCaches();
    const first = caches.getStyledChars("stable");

    caches.clear();

    expect(caches.getStyledChars("stable")).not.toBe(first);
  });
});
