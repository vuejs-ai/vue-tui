import { PassThrough } from "node:stream";
import { defineComponent, nextTick, shallowRef } from "vue";
import { expect, test } from "vite-plus/test";
import { createApp, Text } from "@vue-tui/runtime";
import { makeFakeStdin, makeFakeWritable } from "./test-streams.ts";

// NOTE: this exercises the REAL render throttle (renderThrottleMs = ceil(1000/30)
// = 34ms at the default maxFps). It deliberately does NOT use fake timers: the
// repro depends on a trailing-edge commit being genuinely DEFERRED at unmount
// time, which is a wall-clock property of the scheduler. We never wait out the
// 34ms window — we set the latest state and unmount synchronously inside it — so
// the test is timing-robust (it never races the trailing timer).

test("non-interactive teardown flushes a deferred trailing commit into the final frame", async () => {
  // Bug: in non-interactive non-debug mode the dynamic frame is deferred to the
  // unmount-time trailing write, which emits frameState.lastOutput — the LAST
  // commit that actually ran. If a reactive change is deferred to the throttle's
  // trailing edge and the app unmounts before the ~34ms timer fires, teardown()
  // cancel()s the scheduler (DISCARDING the pending commit) and writes the STALE
  // frame. Ink avoids this: unmount() settleThrottle()-FLUSHES the throttled
  // render (refreshing lastOutput to the current tree) before the final write.
  const value = shallowRef("A");
  const App = defineComponent(() => () => <Text>{value.value}</Text>);

  const stdout = makeFakeWritable({ columns: 80 });
  const stderr = makeFakeWritable({ columns: 80 });
  const { stream: stdin } = makeFakeStdin();

  // Non-interactive is derived from a non-TTY stdout.
  (stdout as unknown as { isTTY: boolean }).isTTY = false;

  const chunks: string[] = [];
  (stdout as unknown as PassThrough).on("data", (chunk: Buffer) => {
    chunks.push(chunk.toString());
  });

  const app = createApp(App);
  // debug is left unset (false): debug forces `unthrottled`, which would set
  // renderThrottleMs=0 and erase the very throttle this bug needs.
  app.mount({ stdout, stdin, stderr, exitOnCtrlC: false, liveUpdates: false });

  await nextTick();
  await nextTick();

  // The mount commit already armed the 34ms throttle window, so subsequent
  // mutations within it are DEFERRED to the trailing edge — no commit runs for
  // them and frameState.lastOutput stays at the mount frame ("A"). We mutate
  // twice (B then C) to model a real deferred-update burst; the host tree ends
  // at "C" while the last committed frame is still "A".
  value.value = "B";
  await nextTick();
  value.value = "C";
  await nextTick();

  // Unmount immediately, inside the window, before the trailing timer fires —
  // so the latest state ("C") is still pending/deferred at teardown.
  app.unmount();
  await app.waitUntilExit();

  const output = chunks.join("");
  // The non-interactive final write must reflect the LATEST tree ("C"), not a
  // stale last-committed frame. Ink v7.0.4 emits exactly "C\n" in this scenario
  // (verified against the real package), so assert byte parity.
  expect(output).toBe("C\n");
});
