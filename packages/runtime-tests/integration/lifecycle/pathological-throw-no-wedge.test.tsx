import { defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import { createApp } from "@vue-tui/runtime";
import { makeFakeWritable, makeFakeStdin } from "./test-streams.ts";

// End-to-end proof that a PATHOLOGICAL non-Error throw never WEDGES the error
// boundary. The original bug: a thrown value with a throwing coercion/getter
// makes one of the three sibling throw sites in the error-exit/display path
// re-throw with NO surrounding try/catch, which wedges Vue's post-flush
// scheduler — the app hangs and waitUntilExit() never settles. We mount a real
// app whose user component throws each shape and assert waitUntilExit() SETTLES
// (rejects) rather than hanging.
//
// Non-sequential: these mount/unmount apps but assert ONLY on the app's own
// waitUntilExit() outcome, never on process-global state (yoga counts,
// listenerCount, fake timers), so file-level parallelism can't perturb them.
//
// A wedge means the promise NEVER settles, which would hang the test until
// vitest's timeout. To keep RED fast and the failure legible, race
// waitUntilExit() against a short timeout and assert the settle won.
const WEDGE_TIMEOUT = Symbol("timeout");

async function expectMountDoesNotWedge(thrown: unknown): Promise<void> {
  const App = defineComponent(() => () => {
    throw thrown;
  });

  const stdout = makeFakeWritable();
  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();

  const app = createApp(App);
  app.mount({ stdout, stdin, stderr, maxFps: 0, exitOnCtrlC: false });

  const outcome = await Promise.race([
    app
      .waitUntilExit()
      .then(() => "resolved" as const)
      .catch(() => "rejected" as const),
    new Promise<typeof WEDGE_TIMEOUT>((r) => setTimeout(() => r(WEDGE_TIMEOUT), 1500)),
  ]);

  // Not wedged: the promise settled before the timeout fired.
  expect(outcome).not.toBe(WEDGE_TIMEOUT);
  // A throwing component routes through exit(err) → REJECTS waitUntilExit().
  expect(outcome).toBe("rejected");

  app.unmount();
}

test("a throwing Symbol.toPrimitive (messageForNonError path) does not wedge the boundary", async () => {
  // `.message` is a non-string, so messageForNonError selects the String(value)
  // branch; String(value) then invokes the throwing Symbol.toPrimitive. Guarded
  // by safeString() inside messageForNonError.
  await expectMountDoesNotWedge({
    get message(): number {
      return 42;
    },
    [Symbol.toPrimitive](): never {
      throw new Error("toPrimitive boom");
    },
  });
});

test("a throwing Symbol.toStringTag getter (isErrorInput path) does not wedge the boundary", async () => {
  // isErrorInput() does `Object.prototype.toString.call(value)`, which READS
  // `value[Symbol.toStringTag]`. A throwing getter there makes isErrorInput
  // re-throw on the error-exit path. Guarded by the try/catch in isErrorInput.
  await expectMountDoesNotWedge({
    get [Symbol.toStringTag](): string {
      throw new Error("toStringTag boom");
    },
  });
});

test("a throwing .stack getter (ErrorOverview path) does not wedge the boundary", async () => {
  // ErrorOverview reads `.stack` off the raw thrown value during render. A
  // throwing getter there makes the overview render throw. Guarded by the
  // try/catch around the single `.stack` read in ErrorOverview.
  await expectMountDoesNotWedge({
    get stack(): string {
      throw new Error("stack boom");
    },
  });
});

test("a Proxy with a throwing getPrototypeOf trap (isErrorInput path) does not wedge the boundary", async () => {
  // isErrorInput() does `value instanceof Error`, which invokes the value's
  // [[GetPrototypeOf]]. A Proxy with a throwing getPrototypeOf trap makes that
  // `instanceof` re-throw on the error-exit path — a GENUINE wedge, since
  // isErrorInput runs in onErrorCaptured / resolveExit / appContext.exit with no
  // outer guard. Guarded by wrapping the whole isErrorInput body in try/catch.
  await expectMountDoesNotWedge(
    new Proxy(
      {},
      {
        getPrototypeOf(): never {
          throw new Error("proto boom");
        },
      },
    ),
  );
});
