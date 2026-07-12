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

it("kitty auto detection owns its reply and delivers adjacent input once", async () => {
  const ps = term("use-input-kitty", ["autoDetectionOnce"]);
  await ps.waitForOutput((output) => output.includes("__READY__") && output.includes("\x1b[?u"));
  ps.write("a\x1b[?1ub");
  await ps.waitForExit();

  expect(ps.output).toContain('__AUTO_INPUTS__:["a","b"]');
  expect(ps.output).toContain("\x1b[>1u");
  expect(ps.output).toContain("\x1b[<u");
  expect(ps.output).toContain("exited");
});

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

// A release preserves the normalized phase and printable codepoint.
it("useInput - release event preserves its phase and printable codepoint", async () => {
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

// --- Non-printable key facts ---

it("useInput - kitty capslock is a non-printable key fact", async () => {
  const ps = term("use-input-kitty", ["capslock-empty"]);
  ps.write(kittyKey(57358));
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

it("useInput - kitty f13 is a non-printable key fact", async () => {
  const ps = term("use-input-kitty", ["f13-empty"]);
  ps.write(kittyKey(57376));
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

it("useInput - kitty printscreen is a non-printable key fact", async () => {
  const ps = term("use-input-kitty", ["printscreen-empty"]);
  ps.write(kittyKey(57361));
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

// --- Printable and control key facts ---

it("useInput - kitty space carries a printable codepoint", async () => {
  const ps = term("use-input-kitty", ["space"]);
  ps.write(kittyKey(32));
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

it("useInput - kitty return is a named non-printable key fact", async () => {
  const ps = term("use-input-kitty", ["return"]);
  ps.write(kittyKey(13));
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

it("useInput - kitty ctrl+letter preserves the key and modifier", async () => {
  const ps = term("use-input-kitty", ["ctrlLetter"]);
  ps.write(kittyKey(97, 5));
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

// --- Kitty Ctrl+C delayed default ---

it("useInput - kitty Ctrl+C exits when the handler allows the default", async () => {
  const ps = term("use-input-kitty", ["kittyCtrlCExit"]);
  ps.write(kittyKey(99, 5));
  await ps.waitForExit();
  expect(ps.output).toContain("__CTRL_C_HANDLER__");
  expect(ps.output).toContain("exited");
});

// --- Ctrl+C delayed default with managed semantic input demand ---

it("an input handler that allows defaults exits on legacy Ctrl+C", async () => {
  const ps = term("input-default-ctrl-c");
  ps.write("\x03");
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

it("an input handler that allows defaults exits on kitty Ctrl+C", async () => {
  const ps = term("input-default-ctrl-c");
  ps.write(kittyKey(99, 5));
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

// Ctrl+Shift+C is a distinct combo (commonly "copy"), not Ctrl+C. The kitty
// protocol disambiguates it, so the Ctrl+C default must not run. The handler
// writes a marker to prove delivery.
it("useInput - kitty Ctrl+Shift+C is delivered, not treated as Ctrl+C exit", async () => {
  const ps = term("use-input-kitty", ["ctrlShiftC"]);
  ps.write(kittyKey(99, 6));
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
