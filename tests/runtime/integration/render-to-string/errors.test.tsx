import { defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import { renderToString } from "@vue-tui/runtime";

test("rethrows non-Error values as wrapped Error", () => {
  const App = defineComponent(() => {
    throw "string error";
  });
  expect(() => renderToString(App)).toThrow("string error");
});

// Bug A: a component that throws literal `undefined` must still propagate as a
// throw. The old `uncaughtError ??= err` + `uncaughtError !== undefined` sentinel
// could not distinguish "no error" from "threw undefined" — it SWALLOWED the
// error and returned the normal frame, violating the documented "errors
// propagate to the caller" contract. We track occurrence with a boolean flag
// instead, mirroring render.ts's `errored` pattern.
test("rethrows when a component throws literal undefined (not swallowed)", () => {
  const App = defineComponent(() => {
    // eslint-disable-next-line @typescript-eslint/only-throw-error -- deliberately throwing undefined to exercise the sentinel bug
    throw undefined;
  });
  expect(() => renderToString(App)).toThrow();
});

// Bug B: a non-Error throw with a meaningful `.message` (e.g. a plain object)
// must surface that message, not `String(value)` → "[object Object]". We wrap
// via messageForNonError (the same source of truth render.ts uses), which reads
// a string `.message` when present.
test("rethrows a non-Error object preserving its .message (not [object Object])", () => {
  const App = defineComponent(() => {
    // eslint-disable-next-line @typescript-eslint/only-throw-error -- deliberately throwing a non-Error object to exercise message extraction
    throw { message: "meaningful detail" };
  });
  expect(() => renderToString(App)).toThrow("meaningful detail");
  // And explicitly assert it is NOT the lossy "[object Object]".
  try {
    renderToString(App);
    expect.unreachable("renderToString should have thrown");
  } catch (err) {
    expect((err as Error).message).toContain("meaningful detail");
    expect((err as Error).message).not.toBe("[object Object]");
  }
});
