import ansiEscapes from "ansi-escapes";
import { describe, expect, test } from "vite-plus/test";
import type { TerminalBackend } from "../../src/terminal/backend.ts";
import { createTestTerminalBackend } from "../../src/terminal/test/backend.ts";
import { hideCursorEscape, showCursorEscape } from "../../src/surface/cursor-helpers.ts";
import { createFrameWriter } from "../../src/surface/frame-writer.ts";
import logUpdate from "../../src/surface/log-update.ts";

function chunks(terminal: ReturnType<typeof createTestTerminalBackend>): string[] {
  return terminal.writes.map((write) => write.data);
}

describe("standard log updates", () => {
  test("renders, replaces, and deduplicates frames", () => {
    const terminal = createTestTerminalBackend();
    const render = logUpdate.create(terminal, { showCursor: true });

    expect(render("Hello\n")).toBe(true);
    expect(render("Hello\n")).toBe(false);
    expect(render("World\n")).toBe(true);

    expect(chunks(terminal)).toEqual(["Hello\n", ansiEscapes.eraseLines(2) + "World\n"]);
  });

  test("sync changes the physical baseline without writing", () => {
    const terminal = createTestTerminalBackend();
    const render = logUpdate.create(terminal, { showCursor: true });

    render.sync("already visible\n");
    expect(chunks(terminal)).toEqual([]);
    expect(render.willRender("already visible\n")).toBe(false);
    expect(render.willRender("changed\n")).toBe(true);
  });

  test("clear erases the current frame and reset only forgets it", () => {
    const terminal = createTestTerminalBackend();
    const render = logUpdate.create(terminal, { showCursor: true });

    render("Hello\n");
    render.clear();
    expect(chunks(terminal).at(-1)).toBe(ansiEscapes.eraseLines(2));

    const count = chunks(terminal).length;
    render("Hello\n");
    render.reset();
    expect(chunks(terminal)).toHaveLength(count + 1);
    render("Hello\n");
    expect(chunks(terminal)).toHaveLength(count + 2);
  });
});

describe("terminal cursor ownership", () => {
  test("hides lazily on a TTY and restores on done", () => {
    const terminal = createTestTerminalBackend();
    const render = logUpdate.create(terminal);

    expect(render.isCursorHidden()).toBe(false);
    render("Hello\n");
    expect(chunks(terminal)[0]).toBe(hideCursorEscape);
    expect(render.isCursorHidden()).toBe(true);

    render.done();
    expect(chunks(terminal).at(-1)).toBe(showCursorEscape);
    expect(render.isCursorHidden()).toBe(false);
  });

  test("does not emit terminal cursor controls for non-TTY output", () => {
    const terminal = createTestTerminalBackend({ capabilities: { stdout: { isTTY: false } } });
    const render = logUpdate.create(terminal);

    render("Hello\n");
    render.done();

    expect(chunks(terminal)).toEqual(["Hello\n"]);
    expect(render.isCursorHidden()).toBe(false);
  });

  test("does not write restoration bytes after output becomes unavailable", () => {
    const base = createTestTerminalBackend();
    let writable = true;
    const terminal: TerminalBackend = {
      ...base,
      get capabilities() {
        return {
          ...base.capabilities,
          stdout: { ...base.capabilities.stdout, canWrite: writable },
        };
      },
    };
    const render = logUpdate.create(terminal);
    render("Hello\n");
    writable = false;

    expect(() => render.done()).not.toThrow();
    expect(chunks(base).at(-1)).not.toBe(showCursorEscape);
    expect(render.isCursorHidden()).toBe(false);
  });
});

describe("frame writer", () => {
  test("deduplicates and allows the same frame after clear or reset", () => {
    const terminal = createTestTerminalBackend();
    const writer = createFrameWriter(terminal);

    writer.write("Hello\n");
    const afterFirst = chunks(terminal).length;
    writer.write("Hello\n");
    expect(chunks(terminal)).toHaveLength(afterFirst);

    writer.clear();
    const afterClear = chunks(terminal).length;
    writer.write("Hello\n");
    expect(chunks(terminal).length).toBeGreaterThan(afterClear);

    writer.reset();
    const afterReset = chunks(terminal).length;
    writer.write("Hello\n");
    expect(chunks(terminal).length).toBeGreaterThan(afterReset);
  });

  test("sync aligns both dedup layers without writing", () => {
    const terminal = createTestTerminalBackend();
    const writer = createFrameWriter(terminal);

    writer.write("A\n");
    const count = chunks(terminal).length;
    writer.sync("B\n");
    expect(chunks(terminal)).toHaveLength(count);
    expect(writer.willRender("B\n")).toBe(false);

    writer.write("A\n");
    expect(chunks(terminal).length).toBeGreaterThan(count);
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
    expect(writer.willRender("NEXT\n")).toBe(true);

    writer.write("NEXT\n");
    expect(chunksWritten.at(-1)).toContain("NEXT");
    expect(writer.willRender("NEXT\n")).toBe(false);
  });

  test("a transaction rollback restores the accepted baseline", () => {
    const terminal = createTestTerminalBackend();
    const writer = createFrameWriter(terminal);

    writer.write("OLD\n");
    const rollback = writer.createRollback();
    writer.write("NEXT\n");
    rollback();
    rollback();

    expect(writer.willRender("OLD\n")).toBe(false);
    expect(writer.willRender("NEXT\n")).toBe(true);
  });
});
