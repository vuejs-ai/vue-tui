import { EventEmitter } from "node:events";
import { test, expect } from "vite-plus/test";
import isInCi from "is-in-ci";
import { bsu, esu, shouldSynchronize } from "../../../runtime/src/io/write-synchronized.ts";

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

test("shouldSynchronize returns true for interactive TTY stream", () => {
  const stream = createStream({ tty: true });
  expect(shouldSynchronize(stream, true)).toBe(true);
});

test("shouldSynchronize returns false for non-interactive TTY stream", () => {
  const stream = createStream({ tty: true });
  expect(shouldSynchronize(stream, false)).toBe(false);
});

test("shouldSynchronize returns false for non-TTY stream", () => {
  const stream = createStream({ tty: false });
  expect(shouldSynchronize(stream, true)).toBe(false);
});

test("shouldSynchronize uses CI detection when interactive is not specified", () => {
  const ttyStream = createStream({ tty: true });
  if (isInCi) {
    expect(shouldSynchronize(ttyStream)).toBe(false);
  } else {
    expect(shouldSynchronize(ttyStream)).toBe(true);
  }
});

test("shouldSynchronize returns false for non-TTY stream when interactive is not specified", () => {
  const stream = createStream({ tty: false });
  expect(shouldSynchronize(stream)).toBe(false);
});
