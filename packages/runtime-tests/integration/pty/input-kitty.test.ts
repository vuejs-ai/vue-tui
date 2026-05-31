import { test as it, expect } from "vite-plus/test";
import term from "./helpers/term.ts";

function kittyKey(codepoint: number, modifiers?: number, eventType?: number): string {
  let seq = `\x1b[${codepoint}`;
  if (modifiers !== undefined || eventType !== undefined) {
    seq += `;${modifiers ?? 1}`;
  }
  if (eventType !== undefined) {
    seq += `:${eventType}`;
  }
  seq += "u";
  return seq;
}

// --- Kitty modifiers through useInput ---

it("useInput - handle kitty protocol super modifier", async () => {
  const ps = term("use-input-kitty", ["super"]);
  ps.write(kittyKey(115, 9));
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

it("useInput - handle kitty protocol hyper modifier", async () => {
  const ps = term("use-input-kitty", ["hyper"]);
  ps.write(kittyKey(104, 17));
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

it("useInput - handle kitty protocol capsLock", async () => {
  const ps = term("use-input-kitty", ["capsLock"]);
  ps.write(kittyKey(97, 65));
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

it("useInput - handle kitty protocol numLock", async () => {
  const ps = term("use-input-kitty", ["numLock"]);
  ps.write(kittyKey(97, 129));
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

it("useInput - handle kitty protocol super+ctrl", async () => {
  const ps = term("use-input-kitty", ["superCtrl"]);
  ps.write(kittyKey(115, 13));
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

// --- Kitty event types through useInput ---

it("useInput - handle kitty protocol press event", async () => {
  const ps = term("use-input-kitty", ["press"]);
  ps.write(kittyKey(97, 1, 1));
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

it("useInput - handle kitty protocol repeat event", async () => {
  const ps = term("use-input-kitty", ["repeat"]);
  ps.write(kittyKey(97, 1, 2));
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

// Ink (use-input.ts:204-217) has no release special-case: a printable 'a'
// release delivers input "a" (the text), not "". The fixture exits only if
// input === "a", so a regression to the old release->"" behavior would hang
// (and fail). See .agents/docs/ink-divergences.md.
it("useInput - release event delivers the key (input='a'), matching Ink", async () => {
  const ps = term("use-input-kitty", ["release"]);
  ps.write(kittyKey(97, 1, 3));
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

// --- Special keys through useInput ---

it("useInput - handle kitty protocol escape key", async () => {
  const ps = term("use-input-kitty", ["escape"]);
  ps.write(kittyKey(27));
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

it("useInput - handle kitty protocol backspace (codepoint 127)", async () => {
  const ps = term("use-input-kitty", ["backspace"]);
  ps.write(kittyKey(127));
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

it("useInput - handle kitty protocol delete", async () => {
  const ps = term("use-input-kitty", ["delete"]);
  ps.write("\x1b[3;1:1~");
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

// --- Non-printable keys produce empty input ---

it("useInput - non-printable kitty key (capslock) produces empty input", async () => {
  const ps = term("use-input-kitty", ["capslock-empty"]);
  ps.write(kittyKey(57358));
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

it("useInput - non-printable kitty key (f13) produces empty input", async () => {
  const ps = term("use-input-kitty", ["f13-empty"]);
  ps.write(kittyKey(57376));
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

it("useInput - non-printable kitty key (printscreen) produces empty input", async () => {
  const ps = term("use-input-kitty", ["printscreen-empty"]);
  ps.write(kittyKey(57361));
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

// --- Text input ---

it("useInput - kitty protocol space key produces space input", async () => {
  const ps = term("use-input-kitty", ["space"]);
  ps.write(kittyKey(32));
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

it("useInput - kitty protocol return key produces carriage return input", async () => {
  const ps = term("use-input-kitty", ["return"]);
  ps.write(kittyKey(13));
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

it("useInput - kitty protocol ctrl+letter via codepoint 1-26 produces input", async () => {
  const ps = term("use-input-kitty", ["ctrlLetter"]);
  ps.write(kittyKey(1, 5));
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

// --- Kitty Ctrl+C with exitOnCtrlC ---

it("useInput - kitty Ctrl+C exits app when exitOnCtrlC is true", async () => {
  const ps = term("use-input-kitty", ["kittyCtrlCExit"]);
  ps.write(kittyKey(3, 5));
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

// --- Ctrl+C exit without useInput (raw mode held by usePaste) ---
// exitOnCtrlC must exit even when no useInput is mounted: the exit lives in the
// always-on stdin controller, encoding-agnostically. The legacy case is the
// control (it already exits via the \x03 byte); the kitty case is the gap Ink
// has — it only checks \x03, so a CSI-u Ctrl+C never exits there.

it("usePaste-only app exits on legacy Ctrl+C (control)", async () => {
  const ps = term("use-paste-ctrl-c");
  ps.write("\x03");
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

it("usePaste-only app exits on kitty Ctrl+C", async () => {
  const ps = term("use-paste-ctrl-c");
  ps.write(kittyKey(99, 5));
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

// Ctrl+Shift+C is a distinct combo (commonly "copy"), not Ctrl+C. The kitty
// protocol disambiguates it, so even with exitOnCtrlC on it must reach the
// handler rather than exit. The handler writes a marker to prove delivery.
it("useInput - kitty Ctrl+Shift+C is delivered, not treated as Ctrl+C exit", async () => {
  const ps = term("use-input-kitty", ["ctrlShiftC"]);
  ps.write(kittyKey(67, 6));
  await ps.waitForExit();
  expect(ps.output).toContain("__CTRL_SHIFT_C__");
});

// --- Query response suppression ---

it("useInput - query response is silently ignored, next real key works", async () => {
  const ps = term("use-input-kitty", ["queryThenKey"]);
  ps.write("\x1b[?1u");
  ps.write("a");
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});
