import { describe, test, expect } from "vite-plus/test";
import type { InputEvent } from "./input-parser.ts";
import { createInputParser } from "./input-parser.ts";

const parseChunks = (chunks: string[]): InputEvent[] => {
  const parser = createInputParser();
  const events: InputEvent[] = [];
  for (const chunk of chunks) {
    events.push(...parser.push(chunk));
  }
  return events;
};

describe("input-parser", () => {
  // ── Plain text ──────────────────────────────────────────────────────

  test("passes through plain text chunks", () => {
    expect(parseChunks(["hello", " ", "world"])).toEqual(["hello", " ", "world"]);
  });

  test("keeps plain text and control sequences separate", () => {
    expect(parseChunks(["a\x1b[Ab"])).toEqual(["a", "\x1b[A", "b"]);
  });

  // ── CSI sequences ──────────────────────────────────────────────────

  test("parses multiple standard CSI keys in one chunk", () => {
    expect(parseChunks(["\x1b[A\x1b[B\x1b[C\x1b[D"])).toEqual([
      "\x1b[A",
      "\x1b[B",
      "\x1b[C",
      "\x1b[D",
    ]);
  });

  test("parses CSI sequences with parameters", () => {
    expect(parseChunks(["\x1b[1;5A\x1b[5~\x1b[6~"])).toEqual(["\x1b[1;5A", "\x1b[5~", "\x1b[6~"]);
  });

  test("parses kitty protocol sequence as one key event", () => {
    expect(parseChunks(["\x1b[97;5u"])).toEqual(["\x1b[97;5u"]);
  });

  // ── SS3 sequences ─────────────────────────────────────────────────

  test("parses SS3 sequences as one key event", () => {
    expect(parseChunks(["\x1bOA\x1bOB\x1bOC\x1bOD"])).toEqual([
      "\x1bOA",
      "\x1bOB",
      "\x1bOC",
      "\x1bOD",
    ]);
  });

  test("does not consume a following escape as SS3 final byte", () => {
    expect(parseChunks(["\x1bO\x1b[A"])).toEqual(["\x1bO", "\x1b[A"]);
  });

  // ── Double-escape (meta) sequences ────────────────────────────────

  test("parses meta+CSI sequence with double escape", () => {
    expect(parseChunks(["\x1b\x1b[A"])).toEqual(["\x1b\x1b[A"]);
  });

  test("parses meta+SS3 sequence with double escape", () => {
    expect(parseChunks(["\x1b\x1bOA"])).toEqual(["\x1b\x1bOA"]);
  });

  test("emits double escape as single event for non-control character", () => {
    expect(parseChunks(["\x1b\x1bx"])).toEqual(["\x1b\x1b", "x"]);
  });

  // ── Escaped printable / supplementary code points ─────────────────

  test("parses escaped printable code points", () => {
    expect(parseChunks(["\x1bx\x1b1"])).toEqual(["\x1bx", "\x1b1"]);
  });

  test("parses escaped supplementary code points", () => {
    expect(parseChunks(["\x1b\u{1F600}"])).toEqual(["\x1b\u{1F600}"]);
  });

  // ── Legacy ESC[[... sequences ─────────────────────────────────────

  test("preserves legacy ESC[[... sequences in a mixed chunk", () => {
    expect(parseChunks(["\x1b[[A\x1b[[5~"])).toEqual(["\x1b[[A", "\x1b[[5~"]);
  });

  test("preserves legacy ESC[[... sequences across chunks", () => {
    expect(parseChunks(["\x1b[[", "A\x1b[[5~"])).toEqual(["\x1b[[A", "\x1b[[5~"]);
  });

  test("parses legacy and standard CSI sequences mixed together", () => {
    expect(parseChunks(["\x1b[[A\x1b[B\x1b[[6~\x1b[1;5D"])).toEqual([
      "\x1b[[A",
      "\x1b[B",
      "\x1b[[6~",
      "\x1b[1;5D",
    ]);
  });

  // ── Incomplete / holding states ───────────────────────────────────

  test("holds incomplete CSI sequence until final byte arrives", () => {
    const parser = createInputParser();
    expect(parser.push("\x1b[")).toEqual([]);
    expect(parser.hasPendingEscape()).toBe(true);
    expect(parser.push("1;5")).toEqual([]);
    expect(parser.hasPendingEscape()).toBe(false);
    expect(parser.push("A")).toEqual(["\x1b[1;5A"]);
  });

  test("holds an unfinished SGR mouse report without starting the finite Escape timer", () => {
    const parser = createInputParser();
    expect(parser.push("\x1b[<64;1;")).toEqual([]);
    expect(parser.peekPending()).toBe("\x1b[<64;1;");
    expect(parser.hasPendingEscape()).toBe(false);

    expect(parser.push("1M")).toEqual(["\x1b[<64;1;1M"]);
    expect(parser.peekPending()).toBe("");
  });

  test("holds incomplete legacy ESC[[... sequence until final byte arrives", () => {
    const parser = createInputParser();
    expect(parser.push("\x1b[[")).toEqual([]);
    expect(parser.push("5")).toEqual([]);
    expect(parser.push("~")).toEqual(["\x1b[[5~"]);
  });

  test("holds incomplete SS3 sequence until final byte arrives", () => {
    const parser = createInputParser();
    expect(parser.push("\x1bO")).toEqual([]);
    expect(parser.push("A")).toEqual(["\x1bOA"]);
  });

  test("holds incomplete double-escape CSI sequence until final byte arrives", () => {
    const parser = createInputParser();
    expect(parser.push("\x1b\x1b[")).toEqual([]);
    expect(parser.push("A")).toEqual(["\x1b\x1b[A"]);
  });

  test("holds incomplete double-escape SS3 sequence until final byte arrives", () => {
    const parser = createInputParser();
    expect(parser.push("\x1b\x1bO")).toEqual([]);
    expect(parser.hasPendingEscape()).toBe(true);
    expect(parser.push("A")).toEqual(["\x1b\x1bOA"]);
  });

  test("assembles CSI sequence from single-byte chunks", () => {
    const parser = createInputParser();
    expect(parser.push("\x1b")).toEqual([]);
    expect(parser.push("[")).toEqual([]);
    expect(parser.push("1")).toEqual([]);
    expect(parser.push(";")).toEqual([]);
    expect(parser.push("5")).toEqual([]);
    expect(parser.push("A")).toEqual(["\x1b[1;5A"]);
  });

  // ── Flush pending ─────────────────────────────────────────────────

  test("keeps pending plain escape and can flush it", () => {
    const parser = createInputParser();
    expect(parser.push("\x1b")).toEqual([]);
    expect(parser.hasPendingEscape()).toBe(true);
    expect(parser.flushPendingEscape()).toBe("\x1b");
    expect(parser.hasPendingEscape()).toBe(false);
  });

  test("flushes pending CSI prefix as literal input", () => {
    const parser = createInputParser();
    expect(parser.push("\x1b[")).toEqual([]);
    expect(parser.hasPendingEscape()).toBe(true);
    expect(parser.flushPendingEscape()).toBe("\x1b[");
    expect(parser.hasPendingEscape()).toBe(false);
    expect(parser.push("A")).toEqual(["A"]);
  });

  test("flushes pending SS3 prefix as literal input", () => {
    const parser = createInputParser();
    expect(parser.push("\x1bO")).toEqual([]);
    expect(parser.hasPendingEscape()).toBe(true);
    expect(parser.flushPendingEscape()).toBe("\x1bO");
    expect(parser.push("x")).toEqual(["x"]);
  });

  test("flushes pending legacy CSI prefix as literal input", () => {
    const parser = createInputParser();
    expect(parser.push("\x1b[[")).toEqual([]);
    expect(parser.hasPendingEscape()).toBe(true);
    expect(parser.flushPendingEscape()).toBe("\x1b[[");
    expect(parser.push("x")).toEqual(["x"]);
  });

  // ── Reset ─────────────────────────────────────────────────────────

  test("reset clears pending input state", () => {
    const parser = createInputParser();
    expect(parser.push("\x1b[")).toEqual([]);
    parser.reset();
    expect(parser.push("A")).toEqual(["A"]);
  });

  // ── Invalid CSI continuation ──────────────────────────────────────

  test("treats invalid CSI continuation as escaped code point plus plain text", () => {
    expect(parseChunks(["\x1b[\n"])).toEqual(["\x1b[", "\n"]);
  });

  // ── Mixed text and key events ─────────────────────────────────────

  test("parses mixed text and many key events in one read", () => {
    expect(parseChunks(["start\x1b[A mid \x1bOH end\x1b[[5~"])).toEqual([
      "start",
      "\x1b[A",
      " mid ",
      "\x1bOH",
      " end",
      "\x1b[[5~",
    ]);
  });

  // ── Empty chunks ──────────────────────────────────────────────────

  test("empty chunk produces no events", () => {
    expect(parseChunks([""])).toEqual([]);
  });

  test("empty chunk does not disturb pending state", () => {
    const parser = createInputParser();
    expect(parser.push("\x1b[")).toEqual([]);
    expect(parser.push("")).toEqual([]);
    expect(parser.hasPendingEscape()).toBe(true);
    expect(parser.push("A")).toEqual(["\x1b[A"]);
  });

  // ── Text + incomplete escape ──────────────────────────────────────

  test("plain text followed by incomplete escape holds escape as pending", () => {
    const parser = createInputParser();
    expect(parser.push("hello\x1b")).toEqual(["hello"]);
    expect(parser.hasPendingEscape()).toBe(true);
    expect(parser.flushPendingEscape()).toBe("\x1b");
  });

  // ── Backspace / delete splitting ──────────────────────────────────

  const deleteAndBackspaceCases = [
    {
      title: "splits batched 0x7F backspace characters into individual events",
      chunks: ["\x7F\x7F\x7F"],
      events: ["\x7F", "\x7F", "\x7F"],
    },
    {
      title: "splits batched backspace characters into individual events",
      chunks: ["\x08\x08\x08"],
      events: ["\x08", "\x08", "\x08"],
    },
    {
      title: "splits mixed 0x7F and 0x08 backspace characters",
      chunks: ["\x7F\x08\x7F"],
      events: ["\x7F", "\x08", "\x7F"],
    },
    {
      title: "splits mixed printable text and 0x7F backspace characters",
      chunks: ["abc\x7F\x7F\x7F"],
      events: ["abc", "\x7F", "\x7F", "\x7F"],
    },
    {
      title: "single 0x7F backspace character is preserved as individual event",
      chunks: ["\x7F"],
      events: ["\x7F"],
    },
    {
      title: "single backspace character is preserved as individual event",
      chunks: ["\x08"],
      events: ["\x08"],
    },
    {
      title: "splits trailing 0x7F backspace from text",
      chunks: ["abc\x7F"],
      events: ["abc", "\x7F"],
    },
    {
      title: "splits 0x7F backspace characters before escape sequences",
      chunks: ["\x7F\x7F\x1b[A"],
      events: ["\x7F", "\x7F", "\x1b[A"],
    },
    {
      title: "splits 0x7F backspace characters after escape sequences",
      chunks: ["\x1b[A\x7F\x7F"],
      events: ["\x1b[A", "\x7F", "\x7F"],
    },
    {
      title: "splits 0x7F backspace characters between escape sequences",
      chunks: ["\x1b[A\x7F\x1b[B"],
      events: ["\x1b[A", "\x7F", "\x1b[B"],
    },
    {
      title: "splits backspace characters around escape sequences",
      chunks: ["\x08\x1b[A\x08"],
      events: ["\x08", "\x1b[A", "\x08"],
    },
    {
      title: "splits interleaved text and 0x7F backspace characters",
      chunks: ["ab\x7Fcd"],
      events: ["ab", "\x7F", "cd"],
    },
    {
      title: "splits carriage return from text outside bracketed paste",
      chunks: ["\rtest"],
      events: ["\r", "test"],
    },
    {
      title: "splits tab from text outside bracketed paste",
      chunks: ["\ttest"],
      events: ["\t", "test"],
    },
    {
      title: "splits Ctrl+C from adjacent text",
      chunks: ["a\x03b"],
      events: ["a", "\x03", "b"],
    },
  ];

  test.each(deleteAndBackspaceCases)("$title", ({ chunks, events }) => {
    expect(parseChunks(chunks)).toEqual(events);
  });

  // ── Bracketed paste ───────────────────────────────────────────────

  test("emits paste event for bracketed paste sequence", () => {
    expect(parseChunks(["\x1b[200~hello world\x1b[201~"])).toEqual([{ paste: "hello world" }]);
  });

  test("emits paste event for multiline bracketed paste", () => {
    expect(parseChunks(["\x1b[200~line1\nline2\x1b[201~"])).toEqual([{ paste: "line1\nline2" }]);
  });

  test("paste content with escape sequences is delivered verbatim", () => {
    expect(parseChunks(["\x1b[200~hello\x1b[Aworld\x1b[201~"])).toEqual([
      { paste: "hello\x1b[Aworld" },
    ]);
  });

  test("emits normal events before and after bracketed paste", () => {
    expect(parseChunks(["before\x1b[200~pasted\x1b[201~after"])).toEqual([
      "before",
      { paste: "pasted" },
      "after",
    ]);
  });

  test("emits multiple paste events in one chunk", () => {
    expect(parseChunks(["\x1b[200~first\x1b[201~mid\x1b[200~second\x1b[201~"])).toEqual([
      { paste: "first" },
      "mid",
      { paste: "second" },
    ]);
  });

  test("holds incomplete bracketed paste as pending", () => {
    const parser = createInputParser();
    expect(parser.push("\x1b[200~hello")).toEqual([]);
    expect(parser.hasPendingEscape()).toBe(false);
    expect(parser.push(" world\x1b[201~")).toEqual([{ paste: "hello world" }]);
  });

  test("assembles bracketed paste from chunk-by-chunk delivery", () => {
    const parser = createInputParser();
    expect(parser.push("\x1b[200~")).toEqual([]);
    expect(parser.push("hello")).toEqual([]);
    expect(parser.push("\x1b[201~")).toEqual([{ paste: "hello" }]);
  });

  test("emits empty paste for adjacent paste markers", () => {
    expect(parseChunks(["\x1b[200~\x1b[201~"])).toEqual([{ paste: "" }]);
  });

  test("handles pasteStart split before the tilde (\\x1b[200 without ~)", () => {
    const parser = createInputParser();
    expect(parser.push("\x1b[200")).toEqual([]);
    expect(parser.hasPendingEscape()).toBe(false);
    expect(parser.push("~hello\x1b[201~")).toEqual([{ paste: "hello" }]);
  });

  test("recognizable length-3 pasteStart prefix does not use the Escape timer", () => {
    const parser = createInputParser();
    expect(parser.push("\x1b[2")).toEqual([]);
    expect(parser.hasPendingEscape()).toBe(false);
  });

  test("recognizable length-4 pasteStart prefix does not use the Escape timer", () => {
    const parser = createInputParser();
    expect(parser.push("\x1b[20")).toEqual([]);
    expect(parser.hasPendingEscape()).toBe(false);
  });

  test("paste event delivers backspace chars verbatim without splitting", () => {
    expect(parseChunks(["\x1b[200~\x7F\x08\x7F\x1b[201~"])).toEqual([{ paste: "\x7F\x08\x7F" }]);
  });
});
