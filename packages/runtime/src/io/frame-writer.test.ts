import { EventEmitter } from "node:events";
import ansiEscapes from "ansi-escapes";
import { describe, expect, test } from "vite-plus/test";
import { hideCursorEscape, showCursorEscape } from "./cursor-helpers.ts";
import { createFrameWriter } from "./frame-writer.ts";
import logUpdate from "./log-update.ts";

interface FakeStdout extends NodeJS.WriteStream {
  readonly chunks: string[];
}

function createStdout({ isTTY = true }: { isTTY?: boolean } = {}): FakeStdout {
  const stdout = new EventEmitter() as unknown as FakeStdout;
  const chunks: string[] = [];
  Object.assign(stdout, {
    columns: 100,
    rows: 24,
    isTTY,
    destroyed: false,
    writableEnded: false,
    chunks,
    write(chunk: unknown) {
      chunks.push(String(chunk));
      return true;
    },
  });
  return stdout;
}

describe("standard log updates", () => {
  test("renders, replaces, and deduplicates frames", () => {
    const stdout = createStdout();
    const render = logUpdate.create(stdout, { showCursor: true });

    expect(render("Hello\n")).toBe(true);
    expect(render("Hello\n")).toBe(false);
    expect(render("World\n")).toBe(true);

    expect(stdout.chunks).toHaveLength(2);
    expect(stdout.chunks[0]).toBe("Hello\n");
    expect(stdout.chunks[1]).toBe(ansiEscapes.eraseLines(2) + "World\n");
  });

  test("sync changes the physical baseline without writing", () => {
    const stdout = createStdout();
    const render = logUpdate.create(stdout, { showCursor: true });

    render.sync("already visible\n");
    expect(stdout.chunks).toEqual([]);
    expect(render.willRender("already visible\n")).toBe(false);
    expect(render.willRender("changed\n")).toBe(true);
  });

  test("clear erases the current frame and reset only forgets it", () => {
    const stdout = createStdout();
    const render = logUpdate.create(stdout, { showCursor: true });

    render("Hello\n");
    render.clear();
    expect(stdout.chunks.at(-1)).toBe(ansiEscapes.eraseLines(2));

    const count = stdout.chunks.length;
    render("Hello\n");
    render.reset();
    expect(stdout.chunks).toHaveLength(count + 1);
    render("Hello\n");
    expect(stdout.chunks).toHaveLength(count + 2);
  });
});

describe("incremental log updates", () => {
  test("rewrites only changed rows at the same height", () => {
    const stdout = createStdout();
    const render = logUpdate.create(stdout, {
      incremental: true,
      showCursor: true,
    });

    render("one\ntwo\nthree\n");
    render("one\nTWO\nthree\n");

    const update = stdout.chunks.at(-1)!;
    expect(update).toContain("TWO");
    expect(update).not.toContain("one");
    expect(update).not.toContain("three");
  });

  test("handles growing, shrinking, and fullscreen frames without trailing newlines", () => {
    const stdout = createStdout();
    const render = logUpdate.create(stdout, {
      incremental: true,
      showCursor: true,
    });

    render("one\ntwo");
    render("one\ntwo\nthree");
    expect(stdout.chunks.at(-1)).toContain("three");

    render("one");
    expect(stdout.chunks.at(-1)).toContain(ansiEscapes.eraseLines(2));

    render("");
    expect(stdout.chunks.at(-1)).toContain(ansiEscapes.eraseEndLine);
  });

  test("clear and done reset the incremental baseline", () => {
    const stdout = createStdout();
    const render = logUpdate.create(stdout, {
      incremental: true,
      showCursor: true,
    });

    render("one\ntwo\n");
    render.clear();
    const afterClear = stdout.chunks.length;
    render("one\ntwo\n");
    expect(stdout.chunks).toHaveLength(afterClear + 1);

    render.done();
    const afterDone = stdout.chunks.length;
    render("one\ntwo\n");
    expect(stdout.chunks).toHaveLength(afterDone + 1);
  });
});

describe("terminal cursor ownership", () => {
  test("hides lazily on a TTY and restores on done", () => {
    const stdout = createStdout();
    const render = logUpdate.create(stdout);

    expect(render.isCursorHidden()).toBe(false);
    render("Hello\n");
    expect(stdout.chunks[0]).toBe(hideCursorEscape);
    expect(render.isCursorHidden()).toBe(true);

    render.done();
    expect(stdout.chunks.at(-1)).toBe(showCursorEscape);
    expect(render.isCursorHidden()).toBe(false);
  });

  test("does not emit terminal cursor controls for non-TTY output", () => {
    const stdout = createStdout({ isTTY: false });
    const render = logUpdate.create(stdout);

    render("Hello\n");
    render.done();

    expect(stdout.chunks).toEqual(["Hello\n"]);
    expect(render.isCursorHidden()).toBe(false);
  });

  test("does not write restoration bytes to a destroyed stream", () => {
    const stdout = createStdout();
    const render = logUpdate.create(stdout);
    render("Hello\n");
    Object.assign(stdout, { destroyed: true });

    expect(() => render.done()).not.toThrow();
    expect(stdout.chunks.at(-1)).not.toBe(showCursorEscape);
    expect(render.isCursorHidden()).toBe(false);
  });
});

describe.each([
  { name: "standard", incremental: false },
  { name: "incremental", incremental: true },
])("frame writer: $name", ({ incremental }) => {
  test("deduplicates and allows the same frame after clear or reset", () => {
    const stdout = createStdout();
    const writer = createFrameWriter(stdout, { incremental });

    writer.write("Hello\n");
    const afterFirst = stdout.chunks.length;
    writer.write("Hello\n");
    expect(stdout.chunks).toHaveLength(afterFirst);

    writer.clear();
    const afterClear = stdout.chunks.length;
    writer.write("Hello\n");
    expect(stdout.chunks.length).toBeGreaterThan(afterClear);

    writer.reset();
    const afterReset = stdout.chunks.length;
    writer.write("Hello\n");
    expect(stdout.chunks.length).toBeGreaterThan(afterReset);
  });

  test("sync aligns both dedup layers without writing", () => {
    const stdout = createStdout();
    const writer = createFrameWriter(stdout, { incremental });

    writer.write("A\n");
    const count = stdout.chunks.length;
    writer.sync("B\n");
    expect(stdout.chunks).toHaveLength(count);
    expect(writer.willRender("B\n")).toBe(false);

    writer.write("A\n");
    expect(stdout.chunks.length).toBeGreaterThan(count);
  });

  test("retries a write that throws", () => {
    const stdout = createStdout();
    let fail = true;
    const chunks: string[] = [];
    const writer = createFrameWriter(stdout, {
      incremental,
      write(chunk) {
        if (fail && chunk.includes("NEXT")) {
          fail = false;
          throw new Error("injected write failure");
        }
        chunks.push(chunk);
        return true;
      },
    });

    writer.write("OLD\n");
    expect(() => writer.write("NEXT\n")).toThrow("injected write failure");
    expect(writer.willRender("NEXT\n")).toBe(true);

    writer.write("NEXT\n");
    expect(chunks.at(-1)).toContain("NEXT");
    expect(writer.willRender("NEXT\n")).toBe(false);
  });

  test("a transaction rollback restores the accepted baseline", () => {
    const stdout = createStdout();
    const writer = createFrameWriter(stdout, { incremental });

    writer.write("OLD\n");
    const rollback = writer.createRollback();
    writer.write("NEXT\n");
    rollback();
    rollback();

    expect(writer.willRender("OLD\n")).toBe(false);
    expect(writer.willRender("NEXT\n")).toBe(true);
  });
});
