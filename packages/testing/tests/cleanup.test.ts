import { expect, test } from "vite-plus/test";
import { cleanup, trackHost } from "../src/cleanup.ts";

test("cleanup releases every host once even when one disposer fails", () => {
  const calls: string[] = [];
  const dispose =
    (name: string, fail = false) =>
    () => {
      calls.push(`dispose:${name}`);
      if (fail) throw new Error(`failed:${name}`);
    };

  trackHost(dispose("first", true));
  trackHost(dispose("second"));

  expect(() => cleanup()).toThrow("failed:first");
  expect(calls).toEqual(["dispose:first", "dispose:second"]);

  expect(() => cleanup()).not.toThrow();
  expect(calls).toHaveLength(2);
});

test("an explicitly disposed host can remove itself from automatic cleanup", () => {
  const calls: string[] = [];
  const untrack = trackHost(() => calls.push("dispose"));

  untrack();
  cleanup();

  expect(calls).toEqual([]);
});
