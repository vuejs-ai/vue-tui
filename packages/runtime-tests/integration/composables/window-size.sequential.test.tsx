// Sequential: mutates / asserts on process-global state —
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
import { INTERNAL_TERMINAL_SIZE_PROBE } from "@vue-tui/runtime/internal";

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

// A deterministic host can model one coherent detected terminal pair when its
// stream object does not expose dimensions directly. Process-global probing is
// intentionally reserved for process.stdout/process.stderr; arbitrary custom
// streams never borrow a different terminal's fields.
test.sequential("useWindowSize derives rows from an explicitly modeled terminal pair", async () => {
  const stdout = makeTtyStream(0);
  const stderr = makeTtyStream(0);
  const stdin = makeFakeStdin();

  let capturedRows = -1;
  const App = defineComponent(() => {
    const { rows } = useWindowSize();
    capturedRows = rows.value;
    return () => <Text>{String(rows.value)}</Text>;
  });

  const app = createApp(App);
  try {
    app.mount({
      stdout,
      stdin,
      stderr,
      debug: true,
      exitOnCtrlC: false,
      [INTERNAL_TERMINAL_SIZE_PROBE]: () => ({
        kind: "detected",
        source: "environment",
        size: { columns: 123, rows: 45 },
      }),
    } as Parameters<typeof app.mount>[0]);
    await new Promise<void>((r) => setTimeout(r, 60));

    expect(capturedRows).toBe(45);
  } finally {
    app.unmount();
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
