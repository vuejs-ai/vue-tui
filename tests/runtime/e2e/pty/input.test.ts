import { expect, test as it } from "vite-plus/test";
import term from "./helpers/term.ts";

async function expectInput(test: string, input: string): Promise<void> {
  const ps = term("use-input", [test]);
  ps.write(input);
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
}

// Exhaustive byte-to-event projection belongs to public-input.test.ts. The PTY
// layer samples one representative from each terminal-facing event class.
it.each([
  ["plain insertion text", "lowercase", "q"],
  ["standalone Escape after its disambiguation window", "escape", "\x1b"],
  ["named key", "upArrow", "\x1b[A"],
  ["character shortcut", "ctrl", "\x06"],
] as const)("useInput - carries %s through a real PTY", async (_label, test, input) => {
  await expectInput(test, input);
});

it("useInput - handles rapid arrows and Enter in one chunk", async () => {
  await expectInput("rapidArrowsEnter", "\x1b[B\x1b[B\x1b[B\r");
});

it.each([["complete uninterpreted control sequence", "dropUninterpreted", "\x1b[?25hq"]] as const)(
  "useInput - drops %s",
  async (_label, test, input) => {
    await expectInput(test, input);
  },
);

it("useInput - default-false handler receives and can own legacy Ctrl+C", async () => {
  const ps = term("use-input-ctrl-c");
  ps.write("\x03");
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

it("useInput - explicit exitOnCtrlC exits before delivering Kitty Ctrl+C", async () => {
  const ps = term("input-default-ctrl-c");
  ps.write("\x1b[99;5u");
  await ps.waitForOutput((output) => output.includes("exited"));
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

it("useInput - private keyboard negotiation owns its reply and preserves adjacent input", async () => {
  const ps = term("input-auto-negotiation");
  await ps.waitForOutput((output) => output.includes("__READY__") && output.includes("\x1b[?u"));
  ps.write("a\x1b[?1ub");
  await ps.waitForOutput(
    (output) =>
      output.includes('__AUTO_INPUTS__:["a","b"]') &&
      output.includes("\x1b[>1u") &&
      output.includes("\x1b[<u") &&
      output.includes("exited"),
  );
  await ps.waitForExit();

  expect(ps.output.split("\x1b[>1u")).toHaveLength(2);
  expect(ps.output.split("\x1b[<u")).toHaveLength(2);
  expect(ps.output.lastIndexOf("\x1b[<u")).toBeGreaterThan(ps.output.lastIndexOf("\x1b[>1u"));
  expect(ps.output).toContain('__AUTO_INPUTS__:["a","b"]');
  expect(ps.output).toContain("exited");
});

it("useInput - ignores input while inactive", async () => {
  const ps = term("use-input-multiple");
  ps.write("x");
  await ps.waitForExit();
  expect(ps.output).not.toContain("xx");
  expect(ps.output).toContain("x");
  expect(ps.output).toContain("exited");
});

it("useInput - does not add one stdin listener per hook", async () => {
  const ps = term("use-input-many");
  await ps.waitForExit();
  expect(ps.output).not.toContain("MaxListenersExceededWarning");
  expect(ps.output).toContain("exited");
});

it("useInput - discrete priority keeps states in sync during rapid input", async () => {
  const ps = term("use-input-discrete-priority");
  await ps.waitForOutput((output) => output.includes("__READY__"));

  for (const delayMilliseconds of [0, 30, 60, 90, 120]) {
    setTimeout(() => {
      ps.write("\x1b[3~");
    }, delayMilliseconds);
  }

  await ps.waitForOutput((output) => output.includes("__DEFERRED_EMPTY__"));
  ps.write("\r");
  await ps.waitForExit();
  const finalMatch = /FINAL .+/.exec(ps.output);
  expect(finalMatch?.[0] ?? ps.output.slice(-300)).toContain('query:""');
  expect(ps.output).toContain('FINAL query:"" deferred:""');
});

it("useInput - receives bracketed paste as one normalized event", async () => {
  const ps = term("normalized-paste", ["basic"]);
  ps.write("\x1b[200~hello world\x1b[201~");
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
  expect(ps.output).toContain("\x1b[?2004h");
  expect(ps.output).toContain("\x1b[?2004l");
});

it("useInput - explicit exitOnCtrlC never treats pasted Ctrl+C as a key", async () => {
  const ps = term("normalized-paste", ["ctrlC"]);
  ps.write("\x1b[200~\x03\x1b[201~");
  await ps.waitForExit();
  expect(ps.output).toContain("__PASTE_CTRL_C__");
  expect(ps.output).toContain("exited");
});
