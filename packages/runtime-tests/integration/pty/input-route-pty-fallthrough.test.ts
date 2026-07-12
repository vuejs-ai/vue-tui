import { expect, test } from "vite-plus/test";
import term from "./helpers/term.ts";

const modes = ["inline", "fullscreen"] as const;
const inputPrefix = Buffer.from("A\x1b[?");
const inputSuffix = Buffer.concat([
  Buffer.from("1u\x03\x1b[200~paste\x03\x1b[?1u\nbody\x1b[201~\x1b[?25h"),
  Buffer.from([0x80]),
]);
const expectedChildHex = Buffer.concat([
  Buffer.from("A\x03paste\x03\x1b[?1u\nbody\x1b[?25h"),
  Buffer.from("�"),
]).toString("hex");
const expectedExternalSequences = [
  "A",
  "\x03",
  "\x1b[200~paste\x03\x1b[?1u\nbody\x1b[201~",
  "\x1b[?25h",
  "�",
].map((sequence) => Buffer.from(sequence).toString("hex"));

test.each(modes)(
  "routes normalized facts through an explicit adapter into a real child PTY (%s)",
  async (mode) => {
    const ps = term("input-route-pty-fallthrough", [mode], { name: "xterm-256color" });
    try {
      await ps.waitForOutput(
        (output) => output.includes("__READY__") && output.includes("\x1b[?u"),
      );
      ps.write(inputPrefix);
      await new Promise((resolve) => setTimeout(resolve, 35));
      ps.write(inputSuffix);
      await ps.waitForOutput(
        (output) =>
          output.includes("__FALLTHROUGH_OK__") &&
          output.includes("\x1b[<u") &&
          output.includes("\x1b[?2004l"),
      );
      await ps.waitForExit();

      expect(ps.output).toContain("\x1b[>1u");
      expect(ps.output).toContain("\x1b[<u");
      expect(ps.output).toContain("\x1b[?2004h");
      expect(ps.output).toContain("\x1b[?2004l");
      expect(ps.output).toContain('__KINDS__["text","key","paste","uninterpreted","text"]__');
      expect(ps.output).toContain(
        '__FIDELITIES__["normalized-utf8-sequence","normalized-utf8-sequence","normalized-utf8-sequence","normalized-utf8-sequence","normalized-utf8-sequence"]__',
      );
      expect(ps.output).toContain(`__SEQUENCES__${JSON.stringify(expectedExternalSequences)}__`);
      expect(ps.output).toContain(`__CHILD_HEX__${expectedChildHex}__`);
      expect(ps.output).toContain("__FALLTHROUGH_OK__");

      if (mode === "fullscreen") {
        expect(ps.output).toContain("\x1b[?1049h");
        expect(ps.output).toContain("\x1b[?1049l");
      } else {
        expect(ps.output).not.toContain("\x1b[?1049h");
        expect(ps.output).not.toContain("\x1b[?1049l");
      }
    } finally {
      ps.killNow("SIGKILL");
    }
  },
);
