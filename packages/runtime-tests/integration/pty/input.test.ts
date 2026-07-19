import { expect, test as it } from "vite-plus/test";
import term from "./helpers/term.ts";

async function expectInput(test: string, input: string): Promise<void> {
  const ps = term("use-input", [test]);
  ps.write(input);
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
}

it.each([
  ["lowercase insertion text", "lowercase", "q"],
  ["uppercase insertion text", "uppercase", "Q"],
  ["Enter key", "enter", "\r"],
  [
    "bracketed paste containing carriage return",
    "pastedCarriageReturn",
    "\x1b[200~\rtest\x1b[201~",
  ],
  ["bracketed paste containing Tab", "pastedTab", "\x1b[200~\ttest\x1b[201~"],
  ["complete bracketed paste", "bracketedPaste", "\x1b[200~hello\x1b[201~"],
] as const)("useInput - handles %s", async (_label, test, input) => {
  await expectInput(test, input);
});

it.each([
  ["Escape", "escape", "\x1b"],
  ["Ctrl+F character shortcut", "ctrl", "\x06"],
  ["Alt+M character shortcut", "alt", "\x1bm"],
  ["Alt+Backspace", "altBackspace", "\x1b\x7f"],
  ["Alt+Enter", "altEnter", "\x1b\r"],
] as const)("useInput - handles %s", async (_label, test, input) => {
  await expectInput(test, input);
});

it.each([
  ["Up", "upArrow", "\x1b[A"],
  ["Down", "downArrow", "\x1b[B"],
  ["Left", "leftArrow", "\x1b[D"],
  ["Right", "rightArrow", "\x1b[C"],
  ["Alt+Up", "upArrowAlt", "\x1b\x1b[A"],
  ["Alt+Down", "downArrowAlt", "\x1b\x1b[B"],
  ["Alt+Left", "leftArrowAlt", "\x1b\x1b[D"],
  ["Alt+Right", "rightArrowAlt", "\x1b\x1b[C"],
  ["Ctrl+Up", "upArrowCtrl", "\x1b[1;5A"],
  ["Ctrl+Down", "downArrowCtrl", "\x1b[1;5B"],
  ["Ctrl+Left", "leftArrowCtrl", "\x1b[1;5D"],
  ["Ctrl+Right", "rightArrowCtrl", "\x1b[1;5C"],
  ["Page Down", "pageDown", "\x1b[6~"],
  ["Page Up", "pageUp", "\x1b[5~"],
  ["Home", "home", "\x1b[H"],
  ["End", "end", "\x1b[F"],
  ["Tab", "tab", "\t"],
  ["Shift+Tab", "shiftTab", "\x1b[Z"],
  ["Backspace", "backspace", "\b"],
  ["Delete", "delete", "\x1b[3~"],
] as const)("useInput - handles the finite %s key", async (_label, test, input) => {
  await expectInput(test, input);
});

it("useInput - handles rapid arrows and Enter in one chunk", async () => {
  await expectInput("rapidArrowsEnter", "\x1b[B\x1b[B\x1b[B\r");
});

it.each([
  ["unsupported F1", "dropUnsupported", "\x1bOPq"],
  ["complete uninterpreted control sequence", "dropUninterpreted", "\x1b[?25hq"],
] as const)("useInput - drops %s", async (_label, test, input) => {
  await expectInput(test, input);
});

it.each([
  ["legacy", "\x03"],
  ["Kitty", "\x1b[99;5u"],
] as const)("useInput - preventDefault handler can own %s Ctrl+C", async (_label, input) => {
  const ps = term("use-input-ctrl-c");
  ps.write(input);
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

it.each([
  ["legacy", "\x03"],
  ["Kitty", "\x1b[99;5u"],
] as const)("useInput - Runtime exits on unprevented %s Ctrl+C", async (_label, input) => {
  const ps = term("input-default-ctrl-c");
  ps.write(input);
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

  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  for (const delayMilliseconds of [0, 30, 60, 90, 120]) {
    setTimeout(() => {
      ps.write("\x1b[3~");
    }, delayMilliseconds);
  }

  await delay(200);
  await delay(2000);
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

it("useInput - preserves escape sequences inside paste", async () => {
  const ps = term("normalized-paste", ["escapeSequences"]);
  ps.write("\x1b[200~hello\x1b[Aworld\x1b[201~");
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

it("useInput - does not split one bracketed paste into multiple facts", async () => {
  const ps = term("normalized-paste", ["singleFact"]);
  ps.write("\x1b[200~hello\x1b[201~");
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

it("useInput - delivers one paste fact to every captured global hook", async () => {
  const ps = term("normalized-paste", ["multipleHooks"]);
  ps.write("\x1b[200~hello\x1b[201~");
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});
