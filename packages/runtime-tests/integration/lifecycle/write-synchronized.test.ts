import { EventEmitter } from "node:events";
import { test, expect } from "vite-plus/test";
import { bsu, esu, shouldSynchronize } from "../../../runtime/dist/internal.mjs";

const createStream = ({ tty = false } = {}) => {
  const stream = new EventEmitter() as unknown as NodeJS.WriteStream;
  if (tty) {
    stream.isTTY = true;
  }
  return stream;
};

test("bsu is the expected synchronized update sequence", () => {
  expect(bsu).toBe("\x1b[?2026h");
});

test("esu is the expected synchronized update sequence", () => {
  expect(esu).toBe("\x1b[?2026l");
});

test("shouldSynchronize returns true for TTY stream", () => {
  const stream = createStream({ tty: true });
  expect(shouldSynchronize(stream)).toBe(true);
});

test("shouldSynchronize returns false for non-TTY stream", () => {
  const stream = createStream({ tty: false });
  expect(shouldSynchronize(stream)).toBe(false);
});
