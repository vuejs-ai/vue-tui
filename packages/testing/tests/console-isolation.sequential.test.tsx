// These tests temporarily provide Node's real Console constructor on the process-global console
// so they can prove that the deterministic host never installs runtime console wrappers.
import { Console as NodeConsole } from "node:console";
import { expect, test } from "vite-plus/test";
import { Text } from "@vue-tui/runtime";
import { render } from "../src/index.ts";

function consoleMethods() {
  return {
    log: console.log,
    warn: console.warn,
    error: console.error,
  };
}

test.sequential("one render never patches the process-global console", async () => {
  const previousConsoleConstructor = (console as { Console?: typeof NodeConsole }).Console;
  (console as { Console?: typeof NodeConsole }).Console = NodeConsole;
  const before = consoleMethods();

  try {
    const result = await render(() => <Text>isolated</Text>);
    expect(consoleMethods()).toEqual(before);

    result.unmount();
    expect(consoleMethods()).toEqual(before);
  } finally {
    (console as { Console?: typeof NodeConsole }).Console = previousConsoleConstructor;
  }
});

test.sequential("overlapping renders cannot restore console wrappers out of order", async () => {
  const previousConsoleConstructor = (console as { Console?: typeof NodeConsole }).Console;
  (console as { Console?: typeof NodeConsole }).Console = NodeConsole;
  const before = consoleMethods();

  try {
    const first = await render(() => <Text>first</Text>);
    const second = await render(() => <Text>second</Text>);
    expect(consoleMethods()).toEqual(before);

    first.unmount();
    expect(consoleMethods()).toEqual(before);

    second.unmount();
    expect(consoleMethods()).toEqual(before);
  } finally {
    (console as { Console?: typeof NodeConsole }).Console = previousConsoleConstructor;
  }
});
