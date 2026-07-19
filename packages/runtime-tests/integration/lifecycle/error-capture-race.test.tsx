import { PassThrough } from "node:stream";
import { defineComponent, h, nextTick, shallowRef } from "vue";
import { expect, test } from "vite-plus/test";
import stripAnsi from "strip-ansi";
import { createApp, Text, useApp } from "@vue-tui/runtime";
import type { InternalMountOptions } from "../../../runtime/dist/internal.mjs";
import {
  captureWrites,
  getContentWrites,
  makeFakeStdin,
  makeFakeWritable,
} from "./test-streams.ts";

// A NON-TTY writable (isTTY=false). makeFakeWritable() forces isTTY=true, which
// selects live output; for the final-stream race below we need
// a piped stream so Runtime selects final-stream output.
function makeNonTtyWritable(): NodeJS.WriteStream {
  const s = new PassThrough() as unknown as NodeJS.WriteStream;
  Object.assign(s, { columns: 100, rows: 100, isTTY: false });
  return s;
}

// These two tests pin down the error-capture/exit-race contract. They mount
// directly (not via @vue-tui/testing's render(), which re-throws and discards
// the painted frame) so we can read the ErrorOverview frame AND inspect what
// waitUntilExit() settles with from a single mount.

// --- BUG #2: error swallowed when unmount() races the deferred exit ---
// When a render-flush throw queues the boundary's exit and host code calls
// app.unmount() synchronously in the SAME task (before the deferred exit runs),
// the thrown error must still reject waitUntilExit(). Before the fix the
// pendingExitError was recorded only inside the deferred exit, so the racing
// unmount's resolveExit() read undefined and RESOLVED clean — swallowing the
// error. The fix (Option B) records pendingExitError SYNCHRONOUSLY in
// onErrorCaptured (recordExitError) while keeping teardown DEFERRED, so the race
// rejects with the error without disturbing frame/paint timing.
test("update-flush throw then synchronous unmount(): waitUntilExit REJECTS with the thrown error", async () => {
  const stdout = makeFakeWritable();
  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();

  const trigger = shallowRef(false);
  const ThrowsOnUpdate = defineComponent(() => {
    return () => {
      if (trigger.value) {
        throw new Error("UPDATE_FLUSH_BOOM");
      }
      return h(Text, null, "ok");
    };
  });

  const app = createApp(ThrowsOnUpdate);
  app.mount({ stdout, stdin, stderr, maxFps: 0 } as InternalMountOptions);

  type Settled = { kind: "rejected"; message: unknown } | { kind: "resolved"; value: unknown };
  const done: Promise<Settled> = app.waitUntilExit().then(
    (value: unknown): Settled => ({ kind: "resolved", value }),
    (e: unknown): Settled => ({ kind: "rejected", message: (e as Error)?.message }),
  );

  // Let the initial mount flush.
  await nextTick();

  // Flip a ref that throws on render. The throw happens INSIDE the flush this
  // await waits on, which queues the boundary's deferred exit.
  trigger.value = true;
  await nextTick();

  // Race: synchronously unmount in the SAME task, before the queued exit runs.
  app.unmount();

  const settled = await done;

  expect(settled.kind).toBe("rejected");
  if (settled.kind !== "rejected") throw new Error("expected rejection, got resolve");
  expect(settled.message).toBe("UPDATE_FLUSH_BOOM");
});

// --- BUG #5: two throws in one flush — overlay vs reject must AGREE ---
// If two siblings throw in the same synchronous flush, the DISPLAYED overview
// and the REJECTED error must be the SAME (first-thrown) error. Before the fix
// `caught` was last-wins (displayed B) while the exit path was first-wins
// (rejected A) — a display/reject mismatch.
test("two sibling throws in one flush: displayed overview and rejected error AGREE (both first-thrown)", async () => {
  const stdout = makeFakeWritable();
  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();
  const writes = captureWrites(stdout);

  const ThrowerA = defineComponent(() => {
    return () => {
      throw new Error("ERROR_A_FIRST");
    };
  });
  const ThrowerB = defineComponent(() => {
    return () => {
      throw new Error("ERROR_B_SECOND");
    };
  });
  // Two siblings under one parent: both render (and throw) in the same flush.
  const Root = defineComponent(() => {
    return () => h(Text, null, [h(ThrowerA), h(ThrowerB)]);
  });

  const app = createApp(Root);
  app.mount({ stdout, stdin, stderr, maxFps: 0 } as InternalMountOptions);

  type Reject = { kind: "rejected"; message: unknown } | { kind: "resolved" };
  const settled: Promise<Reject> = app.waitUntilExit().then(
    (): Reject => ({ kind: "resolved" }),
    (e: unknown): Reject => ({ kind: "rejected", message: (e as Error)?.message }),
  );

  await new Promise<void>((r) => setImmediate(r));
  await new Promise<void>((r) => setImmediate(r));
  const reject = await settled;

  const content = getContentWrites(writes);
  const lastContentWrite = content.at(-1);
  if (lastContentWrite === undefined) throw new Error("no content write captured");
  const frame = stripAnsi(lastContentWrite);

  // Reject is first-wins.
  expect(reject.kind).toBe("rejected");
  if (reject.kind !== "rejected") throw new Error("expected rejection");
  expect(reject.message).toBe("ERROR_A_FIRST");

  // Display agrees: the overview shows the SAME (first-thrown) error, not B.
  expect(frame).toContain("ERROR_A_FIRST");
  expect(frame).not.toContain("ERROR_B_SECOND");
});

// --- BUG #5, through the exit() door: a captured throw then a racing exit(err) ---
// Same display/reject contract as the two-sibling case, but the SECOND error
// arrives via host code calling useApp().exit(Error2) — not a second throw.
// Sequence: a descendant throws Error1 during a flush → the boundary's
// onErrorCaptured shows Error1 in the overview AND calls recordExitError(Error1),
// which sets pendingExitError=Error1 WITHOUT setting exitInitiated, then defers
// nextTick(exitWithError(Error1)). Before that microtask runs, host code calls
// exit(Error2) synchronously in the same task: exitInitiated is still false so
// exit() proceeds. With `pendingExitError = errorOrResult` it CLOBBERS to Error2,
// so the overview shows Error1 while waitUntilExit() rejects Error2 — the exact
// display/reject disagreement BUG #5 forbids. With `pendingExitError ??=` exit()
// keeps the already-recorded Error1, so display and reject AGREE.
test("captured throw then racing exit(err): displayed overview and rejected error AGREE (both Error1)", async () => {
  const stdout = makeFakeWritable();
  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();
  const writes = captureWrites(stdout);

  const trigger = shallowRef(false);
  // A non-throwing sibling retains exit() (via useApp()) so the host can call it
  // synchronously from the test, after the boundary has captured but before the
  // deferred exitWithError microtask runs.
  // Held in an object so TS doesn't narrow it to `never`: the assignment happens
  // inside Retainer's setup closure, which control-flow analysis can't see, so a
  // plain `let` read after the await would narrow to its `null` initializer.
  const retainer: { exit: ((error?: Error) => void) | null } = { exit: null };
  const Retainer = defineComponent(() => {
    retainer.exit = useApp().exit;
    return () => h(Text, null, "retainer");
  });
  const ThrowsOnUpdate = defineComponent(() => {
    return () => {
      if (trigger.value) {
        throw new Error("ERROR_1_THROWN");
      }
      return h(Text, null, "ok");
    };
  });
  const Root = defineComponent(() => {
    return () => h(Text, null, [h(Retainer), h(ThrowsOnUpdate)]);
  });

  const app = createApp(Root);
  app.mount({ stdout, stdin, stderr, maxFps: 0 } as InternalMountOptions);

  type Settled = { kind: "rejected"; message: unknown } | { kind: "resolved"; value: unknown };
  const done: Promise<Settled> = app.waitUntilExit().then(
    (value: unknown): Settled => ({ kind: "resolved", value }),
    (e: unknown): Settled => ({ kind: "rejected", message: (e as Error)?.message }),
  );

  // Let the initial mount flush so the Retainer has captured exit().
  await nextTick();
  const retainedExit = retainer.exit;
  if (retainedExit === null) throw new Error("exit() was not retained from useApp()");

  // Throw Error1 inside the update flush: onErrorCaptured runs synchronously
  // during this flush — it shows Error1 in the overview and records it via
  // recordExitError(Error1), then queues nextTick(exitWithError(Error1)).
  trigger.value = true;
  await nextTick();

  // Race: host calls exit(Error2) in the SAME task, before the deferred
  // exitWithError(Error1) microtask runs. With `=` this clobbers pendingExitError
  // to Error2; with `??=` it leaves Error1 intact.
  retainedExit(new Error("EXIT_ERROR_2"));

  const settled = await done;

  // Reject keeps the first (thrown, displayed) error.
  expect(settled.kind).toBe("rejected");
  if (settled.kind !== "rejected") throw new Error("expected rejection, got resolve");
  expect(settled.message).toBe("ERROR_1_THROWN");

  // Display agrees: the overview painted the SAME first error, never Error2.
  const content = getContentWrites(writes);
  const lastContentWrite = content.at(-1);
  if (lastContentWrite === undefined) throw new Error("no content write captured");
  const frame = stripAnsi(lastContentWrite);
  expect(frame).toContain("ERROR_1_THROWN");
  expect(frame).not.toContain("EXIT_ERROR_2");
});

// --- BUG #2, the final-stream case ---
// This is the exact case the discarded synchronous-exit approach broke and the
// case Option B must handle: a piped (non-TTY) stdout with live updates disabled. The
// racing app.unmount() runs teardown() + resolveExit() SYNCHRONOUSLY (only the
// boundary's deferred exitWithError teardown is microtask-driven), so resolveExit
// reads pendingExitError in the same task. The synchronous record
// (recordExitError) is what makes the race reject; remove it and this test goes
// RED (resolves clean — the original swallow).
test("final stream: update-flush throw + synchronous unmount() still REJECTS", async () => {
  const stdout = makeNonTtyWritable();
  const stderr = makeNonTtyWritable();
  const { stream: stdin } = makeFakeStdin();

  const trigger = shallowRef(false);
  const ThrowsOnUpdate = defineComponent(() => {
    return () => {
      if (trigger.value) {
        throw new Error("NONINTERACTIVE_BOOM");
      }
      return h(Text, null, "ok");
    };
  });

  const app = createApp(ThrowsOnUpdate);
  // A piped stdout selects final-stream output.
  app.mount({ stdout, stdin, stderr });

  type Settled = { kind: "rejected"; message: unknown } | { kind: "resolved"; value: unknown };
  const done: Promise<Settled> = app.waitUntilExit().then(
    (value: unknown): Settled => ({ kind: "resolved", value }),
    (e: unknown): Settled => ({ kind: "rejected", message: (e as Error)?.message }),
  );

  await nextTick();

  // Throw inside the update flush, then race the unmount in the SAME task.
  trigger.value = true;
  await nextTick();
  app.unmount();

  const settled = await done;

  expect(settled.kind).toBe("rejected");
  if (settled.kind !== "rejected") throw new Error("expected rejection, got resolve");
  expect(settled.message).toBe("NONINTERACTIVE_BOOM");
});

// --- FRAME-PAINTING regression guard (the synchronous approach would have
// broken the unthrottled live paint by letting teardown run before the
// errored→true re-render committed) ---
//
// Two mode-specific assertions, both pinned to MAIN's empirically-measured
// behavior (Option B keeps teardown timing byte-identical to main):
//   - unthrottled live output: main DOES paint the ErrorOverview frame (the last
//     content write contains the error message). Option B must preserve that.
//   - final stream: main does NOT paint ErrorOverview — its only
//     content write is a bare trailing "\n" (Ink's `this.lastOutput + '\n'`
//     branch, and lastOutput is empty because the dynamic frame was deferred and
//     the boundary's error frame is never committed on this path). We assert the
//     fix MATCHES main: no error message reaches stdout, just the trailing
//     newline. (Verified by probe: main writes ["\n",""]; Option B writes the
//     same.)
test("unthrottled live output still paints the ErrorOverview frame", async () => {
  const stdout = makeFakeWritable();
  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();
  const writes = captureWrites(stdout);

  const Throws = defineComponent(() => {
    return () => {
      throw new Error("PAINTED_BOOM");
    };
  });

  const app = createApp(Throws);
  app.mount({ stdout, stdin, stderr, maxFps: 0 } as InternalMountOptions);
  app.waitUntilExit().catch(() => {});

  await new Promise<void>((r) => setImmediate(r));
  await new Promise<void>((r) => setImmediate(r));

  const content = getContentWrites(writes);
  const lastContentWrite = content.at(-1);
  if (lastContentWrite === undefined) throw new Error("no content write captured");
  const frame = stripAnsi(lastContentWrite);
  expect(frame).toContain("PAINTED_BOOM");
});

test("final-stream errors are written durably to stderr without a stale stdout frame", async () => {
  const stdout = makeNonTtyWritable();
  const stderr = makeNonTtyWritable();
  const { stream: stdin } = makeFakeStdin();
  const stdoutWrites = captureWrites(stdout);
  const stderrWrites = captureWrites(stderr);

  const Throws = defineComponent(() => {
    return () => {
      throw new Error("UNPAINTED_BOOM");
    };
  });

  const app = createApp(Throws);
  app.mount({ stdout, stdin, stderr });
  app.waitUntilExit().catch(() => {});

  await new Promise<void>((r) => setImmediate(r));
  await new Promise<void>((r) => setImmediate(r));
  await new Promise<void>((r) => setImmediate(r));

  // A failed final-output render must not emit the last successful dynamic
  // frame (or the old bare trailing newline) as if it completed normally.
  expect(getContentWrites(stdoutWrites)).toEqual([]);
  // The failure remains observable even though no live ErrorOverview surface
  // exists. Exact public formatting is future error-contract work; F1.7 requires
  // at least the original Error and message on stderr before waitUntilExit rejects.
  expect(stripAnsi(stderrWrites.join(""))).toContain("Error: UNPAINTED_BOOM");
});
