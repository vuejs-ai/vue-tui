import ansiEscapes from "ansi-escapes";
import { describe, expect, test } from "vite-plus/test";
import { createTestTerminalBackend } from "../terminal/fixtures/test-terminal-backend.ts";
import { createFrameWriter } from "../../src/surface/frame-writer.ts";

function chunks(terminal: ReturnType<typeof createTestTerminalBackend>): string[] {
  return terminal.writes.map((write) => write.data);
}

describe("frame writer", () => {
  test("renders and replaces every requested frame", () => {
    const terminal = createTestTerminalBackend();
    const writer = createFrameWriter(terminal);

    writer.write("Hello\n");
    writer.write("Hello\n");
    writer.write("World\n");

    expect(chunks(terminal)).toEqual([
      "Hello\n",
      ansiEscapes.eraseLines(2) + "Hello\n",
      ansiEscapes.eraseLines(2) + "World\n",
    ]);
  });

  test("clear erases the current frame and reset only forgets it", () => {
    const terminal = createTestTerminalBackend();
    const writer = createFrameWriter(terminal);

    writer.write("Hello\n");
    writer.clear();
    expect(chunks(terminal).at(-1)).toBe(ansiEscapes.eraseLines(2));

    writer.write("Hello\n");
    const beforeReset = chunks(terminal).length;
    writer.reset();
    expect(chunks(terminal)).toHaveLength(beforeReset);
    writer.write("Hello\n");
    expect(chunks(terminal).at(-1)).toBe("Hello\n");
  });

  test("retries a write that throws", () => {
    const terminal = createTestTerminalBackend();
    let fail = true;
    const chunksWritten: string[] = [];
    const writer = createFrameWriter(terminal, {
      write(chunk) {
        if (fail && chunk.includes("NEXT")) {
          fail = false;
          throw new Error("injected write failure");
        }
        chunksWritten.push(chunk);
        return true;
      },
    });

    writer.write("OLD\n");
    expect(() => writer.write("NEXT\n")).toThrow("injected write failure");

    writer.write("NEXT\n");
    expect(chunksWritten.at(-1)).toContain("NEXT");
  });

  test("a transaction rollback restores the previous region height", () => {
    const terminal = createTestTerminalBackend();
    const writer = createFrameWriter(terminal);

    writer.write("OLD\n");
    const rollback = writer.createRollback();
    writer.write("NEXT\nSECOND LINE\n");
    rollback();
    rollback();
    writer.write("FINAL\n");

    expect(chunks(terminal).at(-1)).toBe(ansiEscapes.eraseLines(2) + "FINAL\n");
  });
});
