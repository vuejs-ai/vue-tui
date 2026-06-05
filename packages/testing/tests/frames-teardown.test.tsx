import { defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "../src/index.ts";
import { Static, Text, useApp } from "@vue-tui/runtime";

// The runtime's DEBUG-mode teardown re-emits the final frame to stdout for Ink
// byte-parity (packages/runtime/src/render.ts: the final mountedCommit() in
// teardown()). Because render() registers an internal frame SINK that pushes
// every debug commit chunk into the live `frames` array, that teardown re-emit
// would append spurious entries to `frames` at teardown time.
//
// `frames` must represent renders DURING the test, not the cleanup-time flush.
// The runtime gates the debug commit's SINK calls on `!teardownStarted`, so the
// teardown re-emit still WRITES to stdout (byte parity) but does NOT push to the
// sink. teardownStarted is set TRUE at the top of teardown() before the re-emit,
// so this covers EVERY teardown route — manual unmount() and the exit-driven
// routes — not just the helper's own unmount. We exercise manual unmount() and
// programmatic useApp().exit(); exitOnCtrlC Ctrl+C is the SAME exit-driven path
// (emitInput → appContext.exit() → teardown()), so the exit() cases below cover
// it (a Ctrl+C-specific case is omitted — it depends on stdin/raw-mode timing
// that is environment-fragile in CI, and adds no teardown-route coverage).

test("manual unmount() does not append a teardown frame", async () => {
  const { frames, unmount } = await render(() => <Text>hello</Text>);
  const before = frames.length;
  expect(before).toBeGreaterThan(0);

  unmount();

  // The teardown re-emit (final mountedCommit) writes the dynamic frame again;
  // without the runtime gate it would push one more entry here.
  expect(frames.length).toBe(before);
});

test("programmatic useApp().exit() does not append a teardown frame", async () => {
  let doExit: (() => void) | undefined;
  const Comp = defineComponent(() => {
    const { exit } = useApp();
    doExit = () => exit();
    return () => <Text>bye</Text>;
  });

  const { frames, waitUntilExit } = await render(Comp);
  const before = frames.length;
  expect(before).toBeGreaterThan(0);

  // exit() routes through teardown() WITHOUT the helper's unmount wrapper.
  doExit?.();
  await waitUntilExit();

  expect(frames.length).toBe(before);
});

test("lastFrame() still reads the last real render after unmount", async () => {
  const { frames, lastFrame, unmount } = await render(() => <Text>hi</Text>);
  const lastBefore = frames.at(-1);
  expect(lastFrame()).toContain("hi");

  unmount();

  // The last captured frame must still be the final real render, not a
  // teardown-appended duplicate.
  expect(frames.at(-1)).toBe(lastBefore);
  expect(lastFrame()).toContain("hi");
});

test("unmount() with <Static> does not append static + dynamic teardown frames", async () => {
  const { frames, unmount } = await render(() => (
    <Static items={["a", "b"]}>{({ item }: { item: string }) => <Text>{item}</Text>}</Static>
  ));
  const before = frames.length;
  expect(before).toBeGreaterThan(0);

  unmount();

  // With <Static> present the teardown re-emit writes TWO chunks (accumulated
  // static history, then the dynamic frame). Without the gate `frames` grows by
  // +2; with the gate neither chunk reaches the sink.
  expect(frames.length).toBe(before);
});

test("useApp().exit() with <Static> does not append static + dynamic teardown frames", async () => {
  let doExit: (() => void) | undefined;
  const Comp = defineComponent(() => {
    const { exit } = useApp();
    doExit = () => exit();
    return () => (
      <Static items={["a", "b"]}>{({ item }: { item: string }) => <Text>{item}</Text>}</Static>
    );
  });

  const { frames, waitUntilExit } = await render(Comp);
  const before = frames.length;
  expect(before).toBeGreaterThan(0);

  doExit?.();
  await waitUntilExit();

  // Exit-driven <Static> teardown must also not push the static + dynamic pair.
  expect(frames.length).toBe(before);
});
