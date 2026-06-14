// Sequential: mutates / asserts on process-global state —
//   • process.env.COLUMNS/LINES and process.stdout/process.stderr columns+rows
//     (the terminal-size package, used by resolveSize's fallback, reads these
//     globals directly, so a concurrent sibling would perturb the result), and
//   • process.stdout.listenerCount("resize") — the renderToString teardown-leak
//     test below mounts useWindowSize against the SHARED process.stdout (the
//     no-op AppContext's stdout) and asserts the "resize" listener count returns
//     to baseline; a concurrent sibling that also touches process.stdout would
//     make that count flaky.
// Tests restore every mutated prop in a finally block.

import { PassThrough } from "node:stream";
import process from "node:process";
import { defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import { createApp, renderToString, Text, Transform, useWindowSize } from "@vue-tui/runtime";

function makeTtyStream(columns: number): NodeJS.WriteStream {
  const s = new PassThrough() as unknown as NodeJS.WriteStream;
  // Deliberately no `rows` — forces resolveSize() into the terminal-size fallback.
  Object.assign(s, { columns, isTTY: true });
  return s;
}

function makeFakeStdin(): NodeJS.ReadStream {
  const s = new PassThrough() as unknown as NodeJS.ReadStream;
  Object.assign(s, {
    isTTY: true,
    setRawMode() {
      return s;
    },
    setEncoding() {
      return s;
    },
  });
  (s as unknown as { ref: () => void }).ref = () => {};
  (s as unknown as { unref: () => void }).unref = () => {};
  return s;
}

// Mirrors Ink terminal-resize.tsx:110-152 ("falls back to terminal-size rows
// when stdout.rows is missing"). With the mount stdout reporting columns 0 and
// no rows, resolveSize() calls terminal-size, which — after we zero out the real
// process.stdout/stderr dimensions — resolves rows from process.env.LINES.
test.sequential("useWindowSize falls back to terminal-size rows from env.LINES when stdout.rows is missing", async () => {
  const stdout = makeTtyStream(0);
  const stderr = makeTtyStream(0);
  const stdin = makeFakeStdin();

  const originalColumns = process.env.COLUMNS;
  const originalLines = process.env.LINES;
  const originalStdoutColumns = process.stdout.columns;
  const originalStdoutRows = process.stdout.rows;
  const originalStderrColumns = process.stderr.columns;
  const originalStderrRows = process.stderr.rows;

  let capturedRows = -1;
  const App = defineComponent(() => {
    const { rows } = useWindowSize();
    capturedRows = rows.value;
    return () => <Text>{String(rows.value)}</Text>;
  });

  const app = createApp(App);
  try {
    // terminal-size prefers process.stdout/stderr dimensions, then env.
    // Zero the real streams so env.COLUMNS/LINES is the winning source.
    process.env.COLUMNS = "123";
    process.env.LINES = "45";
    process.stdout.columns = 0;
    process.stdout.rows = 0;
    process.stderr.columns = 0;
    process.stderr.rows = 0;

    app.mount({ stdout, stdin, stderr, debug: true, exitOnCtrlC: false });
    await new Promise<void>((r) => setTimeout(r, 60));

    expect(capturedRows).toBe(45);
  } finally {
    app.unmount();
    // Restore env precisely: a var that was ABSENT must be DELETED, not set to
    // the string "undefined" (which would pollute later tests' CI/size detection).
    if (originalColumns === undefined) delete process.env.COLUMNS;
    else process.env.COLUMNS = originalColumns;
    if (originalLines === undefined) delete process.env.LINES;
    else process.env.LINES = originalLines;
    process.stdout.columns = originalStdoutColumns;
    process.stdout.rows = originalStdoutRows;
    process.stderr.columns = originalStderrColumns;
    process.stderr.rows = originalStderrRows;
  }
});

// renderToString's no-op AppContext uses the REAL shared process.stdout (so
// useWindowSize attaches its `resize` listener there). If layout/paint throws,
// the happy-path app.unmount() is skipped — without an unmount in the outer
// finally, onScopeDispose never runs and the `resize` listener leaks ONE per
// failed call, accumulating toward Node's MaxListenersExceededWarning. A
// throwing <Transform> transform runs during the PAINT phase, so it reproduces
// the layout/paint-phase throw exactly. (Asserts on the shared
// process.stdout listener count — hence this sequential file.)
test.sequential("renderToString does not leak useWindowSize's resize listener when paint throws", () => {
  const Leaky = defineComponent(() => {
    // Registers a `resize` listener on ctx.stdout (process.stdout) via
    // onScopeDispose; only an unmount tears it down.
    useWindowSize();
    return () => (
      // The transform runs during paint, so it throws AFTER app.mount() succeeded.
      <Transform
        transform={() => {
          throw new Error("paint boom");
        }}
      >
        <Text>boom</Text>
      </Transform>
    );
  });

  const before = process.stdout.listenerCount("resize");

  let threwCount = 0;
  for (let i = 0; i < 3; i++) {
    try {
      renderToString(Leaky);
    } catch {
      // renderToString rethrows the paint error after cleanup — expected.
      threwCount++;
    }
  }

  const after = process.stdout.listenerCount("resize");

  // The error path must actually fire (otherwise we'd be testing the happy path).
  expect(threwCount).toBe(3);
  // No net listeners leaked across the three failed calls.
  expect(after).toBe(before);
});

// Control: the CLEAN (non-throwing) renderToString path already unmounts and
// runs onScopeDispose, so it leaks zero resize listeners. Proves the harness is
// sound — the assertion above is meaningful only because this one passes too.
test.sequential("renderToString clean path leaks no useWindowSize resize listener", () => {
  const Clean = defineComponent(() => {
    useWindowSize();
    return () => <Text>clean</Text>;
  });

  const before = process.stdout.listenerCount("resize");
  for (let i = 0; i < 3; i++) {
    const output = renderToString(Clean);
    expect(output).toBe("clean");
  }
  const after = process.stdout.listenerCount("resize");

  expect(after).toBe(before);
});
