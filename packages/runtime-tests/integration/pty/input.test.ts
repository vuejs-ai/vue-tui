import { test, expect } from "vite-plus/test";
import term from "./helpers/term.ts";

// ---------------------------------------------------------------------------
// useInput — basic character input
// ---------------------------------------------------------------------------

test.sequential("useInput - handle lowercase character", async () => {
  const ps = term("use-input", ["lowercase"]);
  ps.write("q");
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

test.sequential("useInput - handle uppercase character", async () => {
  const ps = term("use-input", ["uppercase"]);
  ps.write("Q");
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

test.sequential("useInput - \\r should not count as an uppercase character", async () => {
  const ps = term("use-input", ["uppercase"]);
  ps.write("\r");
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

test.sequential("useInput - pasted carriage return", async () => {
  const ps = term("use-input", ["pastedCarriageReturn"]);
  ps.write("\rtest");
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

test.sequential("useInput - pasted tab", async () => {
  const ps = term("use-input", ["pastedTab"]);
  ps.write("\ttest");
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

test.sequential("useInput - receives bracketed paste when no usePaste handler is active", async () => {
  const ps = term("use-input", ["bracketedPaste"]);
  ps.write("[200~hello[201~");
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

// ---------------------------------------------------------------------------
// useInput — escape / ctrl / meta
// ---------------------------------------------------------------------------

test.sequential("useInput - handle escape", async () => {
  const ps = term("use-input", ["escape"]);
  ps.write("");
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

test.sequential("useInput - escape does not set meta", async () => {
  const ps = term("use-input", ["escapeNoMeta"]);
  ps.write("");
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

test.sequential("useInput - handle ctrl", async () => {
  const ps = term("use-input", ["ctrl"]);
  ps.write("");
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

test.sequential("useInput - handle meta", async () => {
  const ps = term("use-input", ["meta"]);
  ps.write("m");
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

test.sequential("useInput - handle meta + backspace (0x7F)", async () => {
  const ps = term("use-input", ["metaBackspace"]);
  ps.write("");
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

test.sequential("useInput - flushes ESC[ prefix as literal input", async () => {
  const ps = term("use-input", ["escapeBracketPrefix"]);
  ps.write("[");
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

test.sequential("useInput - handle meta + O with pending flush", async () => {
  const ps = term("use-input", ["metaUpperO"]);
  ps.write("O");
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

test.sequential("useInput - handle option + return (macOS)", async () => {
  const ps = term("use-input", ["returnMeta"]);
  ps.write("\r");
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

test.sequential("useInput - handle Ctrl+F1 without crashing", async () => {
  const ps = term("use-input", ["ctrlF1"]);
  ps.write("[1;5P");
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

test.sequential("useInput - handle unmapped ctrl escape sequence without crashing", async () => {
  const ps = term("use-input", ["unmappedCtrlSequence"]);
  // ESC [ 1 ; 5 I — focus-in with ctrl modifier, not in keyName map
  ps.write("[1;5I");
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

// ---------------------------------------------------------------------------
// useInput — navigation keys
// ---------------------------------------------------------------------------

test.sequential("useInput - handle up arrow", async () => {
  const ps = term("use-input", ["upArrow"]);
  ps.write("[A");
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

test.sequential("useInput - handle down arrow", async () => {
  const ps = term("use-input", ["downArrow"]);
  ps.write("[B");
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

test.sequential("useInput - handle left arrow", async () => {
  const ps = term("use-input", ["leftArrow"]);
  ps.write("[D");
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

test.sequential("useInput - handle right arrow", async () => {
  const ps = term("use-input", ["rightArrow"]);
  ps.write("[C");
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

test.sequential("useInput - handles rapid arrows and enter in one chunk", async () => {
  const ps = term("use-input", ["rapidArrowsEnter"]);
  ps.write("[B[B[B\r");
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

test.sequential("useInput - handle meta + up arrow", async () => {
  const ps = term("use-input", ["upArrowMeta"]);
  ps.write("[A");
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

test.sequential("useInput - handle meta + down arrow", async () => {
  const ps = term("use-input", ["downArrowMeta"]);
  ps.write("[B");
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

test.sequential("useInput - handle meta + left arrow", async () => {
  const ps = term("use-input", ["leftArrowMeta"]);
  ps.write("[D");
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

test.sequential("useInput - handle meta + right arrow", async () => {
  const ps = term("use-input", ["rightArrowMeta"]);
  ps.write("[C");
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

test.sequential("useInput - handle ctrl + up arrow", async () => {
  const ps = term("use-input", ["upArrowCtrl"]);
  ps.write("[1;5A");
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

test.sequential("useInput - handle ctrl + down arrow", async () => {
  const ps = term("use-input", ["downArrowCtrl"]);
  ps.write("[1;5B");
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

test.sequential("useInput - handle ctrl + left arrow", async () => {
  const ps = term("use-input", ["leftArrowCtrl"]);
  ps.write("[1;5D");
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

test.sequential("useInput - handle ctrl + right arrow", async () => {
  const ps = term("use-input", ["rightArrowCtrl"]);
  ps.write("[1;5C");
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

test.sequential("useInput - handle page down", async () => {
  const ps = term("use-input", ["pageDown"]);
  ps.write("[6~");
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

test.sequential("useInput - handle page up", async () => {
  const ps = term("use-input", ["pageUp"]);
  ps.write("[5~");
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

test.sequential("useInput - handle home", async () => {
  const ps = term("use-input", ["home"]);
  ps.write("[H");
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

test.sequential("useInput - handle end", async () => {
  const ps = term("use-input", ["end"]);
  ps.write("[F");
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

// ---------------------------------------------------------------------------
// useInput — tab / backspace / delete
// ---------------------------------------------------------------------------

test.sequential("useInput - handle tab", async () => {
  const ps = term("use-input", ["tab"]);
  ps.write("\t");
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

test.sequential("useInput - handle shift + tab", async () => {
  const ps = term("use-input", ["shiftTab"]);
  ps.write("[Z");
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

test.sequential("useInput - handle backspace", async () => {
  const ps = term("use-input", ["backspace"]);
  ps.write("");
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

test.sequential("useInput - handle delete", async () => {
  const ps = term("use-input", ["delete"]);
  ps.write("[3~");
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

test.sequential("useInput - handle remove (delete)", async () => {
  const ps = term("use-input", ["remove"]);
  ps.write("[3~");
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

// ---------------------------------------------------------------------------
// useInput — Ctrl+C with exitOnCtrlC: false
// ---------------------------------------------------------------------------

test.sequential("useInput - handle Ctrl+C when exitOnCtrlC is false", async () => {
  const ps = term("use-input-ctrl-c");
  ps.write("");
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

test.sequential("useInput - handle Ctrl+C via kitty codepoint-3 form when exitOnCtrlC is false", async () => {
  const ps = term("use-input-ctrl-c");
  // Ctrl+C via kitty codepoint 3 form (modifier 5 = ctrl(4) + 1)
  ps.write("[3;5u");
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

// ---------------------------------------------------------------------------
// useInput — multiple hooks / many hooks
// ---------------------------------------------------------------------------

test.sequential("useInput - ignore input if not active", async () => {
  const ps = term("use-input-multiple");
  ps.write("x");
  await ps.waitForExit();
  expect(ps.output).not.toContain("xx");
  expect(ps.output).toContain("x");
  expect(ps.output).toContain("exited");
});

test.sequential("useInput - no MaxListenersExceededWarning with many useInput hooks", async () => {
  const ps = term("use-input-many");
  await ps.waitForExit();
  expect(ps.output).not.toContain("MaxListenersExceededWarning");
  expect(ps.output).toContain("exited");
});

// ---------------------------------------------------------------------------
// useInput — discrete priority (rapid input + deferred state)
// ---------------------------------------------------------------------------

test.sequential("useInput - discrete priority keeps states in sync during rapid input", async () => {
  const ps = term("use-input-discrete-priority");

  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  // Simulate rapid delete key repeat at ~30ms intervals.
  // State starts pre-populated with "abcde". Send 5 rapid deletes
  // to clear it, then wait for transitions to settle and check state.
  for (const delayMilliseconds of [0, 30, 60, 90, 120]) {
    setTimeout(() => {
      ps.write("[3~");
    }, delayMilliseconds);
  }

  await delay(200);

  // Wait for all transitions to settle, then press Enter to report state
  await delay(2000);
  ps.write("\r");
  await ps.waitForExit();
  const finalMatch = /FINAL .+/.exec(ps.output);
  expect(finalMatch?.[0] ?? ps.output.slice(-300)).toContain('query:""');
  expect(ps.output).toContain('FINAL query:"" deferred:""');
});

// ---------------------------------------------------------------------------
// usePaste
// ---------------------------------------------------------------------------

test.sequential("usePaste - receives bracketed paste as single text blob", async () => {
  const ps = term("use-paste", ["basic"]);
  ps.write("[200~hello world[201~");
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
  expect(ps.output).toContain("[?2004h");
  expect(ps.output).toContain("[?2004l");
});

test.sequential("usePaste - paste content with escape sequences is delivered verbatim", async () => {
  const ps = term("use-paste", ["escapeSequences"]);
  ps.write("[200~hello[Aworld[201~");
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

test.sequential("usePaste - useInput does not receive bracketed paste content", async () => {
  const ps = term("use-paste", ["noUseInput"]);
  ps.write("[200~hello[201~");
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

test.sequential("usePaste - multiple simultaneous hooks both receive the same paste event", async () => {
  const ps = term("use-paste", ["multipleHooks"]);
  ps.write("[200~hello[201~");
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});
