import { expect, test } from "vite-plus/test";
import { messageForNonError } from "../../../runtime/dist/internal.mjs";

// Runtime-owned failures sometimes need to turn a non-Error value from a host
// callback into a stable rejection and report. That normalization must not throw
// while inspecting a pathological value, so every coercion here is guarded.
//
// Import the pure helper directly so this internal contract test does not need
// a public Runtime-internal package path or Vue SFC transformation.

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
  // `.message` is a non-string (so the typeof check selects the String(value)
  // branch), and String(value) itself throws because Symbol.toPrimitive throws.
  // Before the fix, normalization could replace the host failure and prevent
  // Runtime's lifecycle promise from settling.
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
