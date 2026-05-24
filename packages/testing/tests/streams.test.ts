import { expect, test } from "vite-plus/test";
import { makeFakeStdin, makeFakeWritable } from "../src/streams.ts";

test("fake stdout reports columns/rows and isTTY", () => {
  const s = makeFakeWritable({ columns: 50, rows: 10 });
  expect(s.columns).toBe(50);
  expect(s.rows).toBe(10);
  expect(s.isTTY).toBe(true);
});

test("fake stdin supports setRawMode and emits data", () => {
  const { stream: s, rawMode } = makeFakeStdin();
  expect(s.isTTY).toBe(true);
  let observed = "";
  s.on("data", (c) => {
    observed += c.toString();
  });
  s.setRawMode(true);
  expect(rawMode.current).toBe(true);
  expect(rawMode.history).toEqual([true]);
  s.emit("data", "hello");
  expect(observed).toBe("hello");
});
