import { expect, test, vi } from "vite-plus/test";
import { createObserverHarness } from "./harness.ts";

test("the observer fails by name when Vite lacks the required per-update HMR seam", () => {
  expect(() => createObserverHarness({ withoutFetchUpdate: true })).toThrowError(
    expect.objectContaining({
      name: "VueTuiViteHmrCompatibilityError",
      message: expect.stringMatching(/Vite 8\.1\.0.*fetchUpdate/),
    }),
  );
});

// Vite runs accept callbacks inside a try/finally with no catch, so anything that
// escapes one ends the dev process. These pin the wrapper that closes that route
// — which shipped with an `instanceof Error` hole because the suite stubbed
// `queueUpdate` as a no-op and never made it reject.
test("an accept callback that throws an Error is reported instead of escaping", async () => {
  const harness = createObserverHarness();
  harness.accept("/src/app.tsx", () => {
    throw new Error("ACCEPT-BOOM");
  });

  await expect(harness.applyUpdate("/src/app.tsx")).resolves.toBeUndefined();
  expect(harness.send).toHaveBeenCalledTimes(1);
  expect(harness.send.mock.calls[0]![0].err).toMatchObject({
    message: "ACCEPT-BOOM",
    phase: "evaluate",
  });
});

test("an async accept callback rejection is reported instead of becoming unhandled", async () => {
  const harness = createObserverHarness();
  harness.accept("/src/app.tsx", async () => {
    throw new Error("ASYNC-ACCEPT-BOOM");
  });

  await expect(harness.applyUpdate("/src/app.tsx")).resolves.toBeUndefined();
  await vi.waitFor(() => {
    expect(harness.send).toHaveBeenCalledTimes(1);
  });
  expect(harness.send.mock.calls[0]![0].err).toMatchObject({
    message: "ASYNC-ACCEPT-BOOM",
    phase: "evaluate",
  });
});

// `throw "boom"` is legal and reaches exactly the same place a thrown Error does.
test.for([
  ["a string", "NON-ERROR-BOOM", "NON-ERROR-BOOM"],
  ["an object", { code: 7 }, '{"code":7}'],
] as const)(
  "an accept callback that throws %s is reported, not rethrown",
  async ([, thrown, message]) => {
    const harness = createObserverHarness();
    harness.accept("/src/app.tsx", () => {
      throw thrown;
    });

    await expect(harness.applyUpdate("/src/app.tsx")).resolves.toBeUndefined();
    expect(harness.send).toHaveBeenCalledTimes(1);
    expect(harness.send.mock.calls[0]![0].err).toMatchObject({ message, phase: "evaluate" });
  },
);

// A failure OUTSIDE any accept callback still escapes as a rejection from the
// batch — a dispose handler is the realistic one, because fetchUpdate awaits it
// before entering its own try.
test("a dispose handler that throws is reported instead of ending the process", async () => {
  const harness = createObserverHarness();
  harness.accept("/src/app.tsx", () => {});
  harness.onDispose("/src/app.tsx", () => {
    throw new Error("DISPOSE-BOOM");
  });

  await expect(harness.applyUpdate("/src/app.tsx")).resolves.toBeUndefined();
  expect(harness.send).toHaveBeenCalledTimes(1);
  expect(harness.send.mock.calls[0]![0].err).toMatchObject({
    message: "DISPOSE-BOOM",
    phase: "evaluate",
  });
});

test("a throwing dispose handler does not skip another update in the same batch", async () => {
  const harness = createObserverHarness();
  const applied: string[] = [];
  harness.accept("/src/broken.tsx", () => applied.push("broken"));
  harness.accept("/src/healthy.tsx", () => applied.push("healthy"));
  harness.onDispose("/src/broken.tsx", () => {
    throw new Error("DISPOSE-BATCH-BOOM");
  });

  await Promise.all([
    harness.applyUpdate("/src/broken.tsx"),
    harness.applyUpdate("/src/healthy.tsx"),
  ]);

  expect(applied).toEqual(["healthy"]);
  expect(harness.send.mock.calls.map((call) => call[0].err.message)).toEqual([
    "DISPOSE-BATCH-BOOM",
  ]);
});

test("a derived failure is suppressed when the update already reported its cause", async () => {
  const harness = createObserverHarness();
  // Exactly the production shape: the import fails, Vite's warnFailedUpdate
  // reports it through the logger, and the compiler-generated callback then
  // destructures the `undefined` it was handed instead of the module.
  harness.importUpdatedModule.mockRejectedValueOnce(new Error("the developer's real error"));
  const renders: unknown[] = [];
  harness.accept("/src/app.tsx", ([mod]) => {
    renders.push((mod as { render: unknown }).render);
  });

  await expect(harness.applyUpdate("/src/app.tsx")).resolves.toBeUndefined();
  expect(renders, "the callback must have thrown before reaching this").toEqual([]);
  expect(harness.send).toHaveBeenCalledTimes(1);
  expect(harness.send.mock.calls[0]![0].err.message).toBe("the developer's real error");
});

// The defect this pins is invisible to any stub that resolves payloads
// independently: HMRClient batches, so the FIRST queueUpdate in a microtask runs
// every queued update's accept callback inside its own call. A scope opened
// there covers the whole batch, and the first update's reported cause then reads
// as an explanation for the second update's entirely unrelated throw.
test("a report in one batched update does not suppress another update's own failure", async () => {
  const harness = createObserverHarness();
  harness.importUpdatedModule.mockImplementation(async ({ acceptedPath }) => {
    if (acceptedPath === "/src/broken.tsx") throw new Error("FIRST-CAUSE");
    return { default: {} };
  });
  const renders: unknown[] = [];
  harness.accept("/src/broken.tsx", ([mod]) => {
    renders.push((mod as { render: unknown }).render);
  });
  harness.accept("/src/other.tsx", () => {
    throw new Error("SECOND-INDEPENDENT-BOOM");
  });

  // Queued in the same microtask, which is what makes them one batch.
  await Promise.all([
    harness.applyUpdate("/src/broken.tsx"),
    harness.applyUpdate("/src/other.tsx"),
  ]);

  const messages = harness.send.mock.calls.map((call) => call[0].err.message);
  expect(messages).toContain("FIRST-CAUSE");
  expect(messages).toContain("SECOND-INDEPENDENT-BOOM");
  expect(messages).not.toContain("Cannot read properties of undefined (reading 'render')");
  expect(renders, "the broken module's callback must have thrown").toEqual([]);
});

test("the same error message from two modules in one batch remains two failures", async () => {
  const harness = createObserverHarness();
  harness.accept("/src/first.tsx", () => {
    throw new Error("SHARED-MESSAGE");
  });
  harness.accept("/src/second.tsx", () => {
    throw new Error("SHARED-MESSAGE");
  });

  await Promise.all([
    harness.applyUpdate("/src/first.tsx"),
    harness.applyUpdate("/src/second.tsx"),
  ]);

  expect(harness.send.mock.calls.map((call) => call[0].err.message)).toEqual([
    "SHARED-MESSAGE",
    "SHARED-MESSAGE",
  ]);
});

test("equal root causes in two dependencies of one accept boundary do not expose a derived error", async () => {
  const harness = createObserverHarness();
  harness.importUpdatedModule.mockRejectedValue(new Error("SAME-ROOT-CAUSE"));
  harness.accept(
    "/src/boundary.ts",
    ([mod]) => {
      void (mod as { render: unknown }).render;
    },
    ["/src/a.ts", "/src/b.ts"],
  );

  await Promise.all([
    harness.applyUpdate("/src/boundary.ts", "/src/a.ts"),
    harness.applyUpdate("/src/boundary.ts", "/src/b.ts"),
  ]);

  expect(harness.send.mock.calls.map((call) => call[0].err.message)).toEqual([
    "SAME-ROOT-CAUSE",
    "SAME-ROOT-CAUSE",
  ]);
});

// Vite runs a batch as `callbacks.forEach(fn => fn())`, so before the guard held
// each callback, the first throw skipped every later module's update as well.
test("a throwing accept callback does not skip the rest of the batch", async () => {
  const harness = createObserverHarness();
  const applied: string[] = [];
  harness.accept("/src/first.tsx", () => {
    throw new Error("FIRST-BOOM");
  });
  harness.accept("/src/second.tsx", () => applied.push("second"));

  await Promise.all([
    harness.applyUpdate("/src/first.tsx"),
    harness.applyUpdate("/src/second.tsx"),
  ]);

  expect(applied).toEqual(["second"]);
});
