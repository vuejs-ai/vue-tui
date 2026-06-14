import { expect, test } from "vite-plus/test";
import { messageForNonError } from "@vue-tui/runtime/internal";

// messageForNonError feeds the error-display / reject path: render.ts's
// onErrorCaptured wraps `new Error(messageForNonError(err))` with NO surrounding
// try/catch (render.ts ~523, and the errorHandler exit path ~1276). Its docstring
// promises it "must not itself throw on a pathological thrown object", so every
// coercion inside it has to be throw-safe.
//
// Imported from the built `@vue-tui/runtime/internal` dist (not source): the
// source module imports box.vue/text.vue, and the runtime-tests vitest config
// has no @vitejs/plugin-vue, so a source-relative import fails to compile.

test("normal values coerce to their expected message", () => {
  expect(messageForNonError(42)).toBe("42");
  expect(messageForNonError("boom")).toBe("boom");
  expect(messageForNonError({ message: "hi" })).toBe("hi");
  expect(messageForNonError(null)).toBe("null");
  expect(messageForNonError(undefined)).toBe("undefined");
  expect(messageForNonError(new Error("x"))).toBe("x");
});

test("a throwing .message getter falls back without throwing", () => {
  // The `.message` READ throws; String(value) on the plain object then yields
  // "[object Object]" safely (toString is the default). Exercises the catch
  // branch's coercion on a value that DOES coerce.
  const pathological = {
    get message(): string {
      throw new Error("message getter boom");
    },
  };
  expect(() => messageForNonError(pathological)).not.toThrow();
  expect(messageForNonError(pathological)).toBe("[object Object]");
});

test("a value whose primitive coercion throws does not throw (the confirmed bug)", () => {
  // HIGH-severity bug: `.message` is a non-string (so the typeof check selects
  // the String(value) branch), and String(value) itself throws because
  // Symbol.toPrimitive throws. Before the fix, messageForNonError re-throws here,
  // wedging render.ts's onErrorCaptured hook (the app hangs, waitUntilExit()
  // never settles).
  const pathological = {
    get message(): number {
      return 42;
    },
    [Symbol.toPrimitive](): never {
      throw new Error("toPrimitive boom");
    },
  };
  expect(() => messageForNonError(pathological)).not.toThrow();
  expect(messageForNonError(pathological)).toBe("[unserializable value]");
});

test("a value that throws in BOTH the message read and String() does not throw", () => {
  // Both guarded spots fire: the message getter throws (catch branch), and the
  // catch branch's String(value) also throws because toString throws.
  const pathological = {
    get message(): string {
      throw new Error("message getter boom");
    },
    toString(): never {
      throw new Error("toString boom");
    },
  };
  expect(() => messageForNonError(pathological)).not.toThrow();
  expect(messageForNonError(pathological)).toBe("[unserializable value]");
});
