import { defineComponent, nextTick, onMounted, onUnmounted, shallowRef } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text } from "@vue-tui/runtime";

test("absolute position with top and left offsets", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row" width={5} height={3}>
        <Box position="absolute" top={1} left={2}>
          <Text>X</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("\n  X\n");
});

test("clears top offset on rerender", async () => {
  const top = shallowRef<number | undefined>(1);

  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row" width={5} height={3}>
        <Box position="absolute" top={top.value} left={2}>
          <Text>X</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );

  expect(lastFrame({ trimLines: true })).toBe("\n  X\n");

  top.value = undefined;
  await nextTick();
  expect(lastFrame({ trimLines: true })).toBe("  X\n\n");
});

function createAbsoluteOverlayProbe(userHeight: number) {
  const showError = shallowRef(false);
  let setups = 0;
  let mounts = 0;
  let unmounts = 0;
  const UserTree = defineComponent(() => {
    const id = ++setups;
    onMounted(() => mounts++);
    onUnmounted(() => unmounts++);
    return () => (
      <Box height={userHeight}>
        <Text>{`USER-ID-${id}-STATE-7`}</Text>
      </Box>
    );
  });
  const App = defineComponent(() => () => (
    <Box flexDirection="column" flexGrow={1}>
      <Box flexGrow={1}>
        <UserTree />
      </Box>
      {showError.value ? (
        <Box position="absolute" top={0} left={0} flexDirection="column">
          <Text>ERR-ROW-0-OVERWRITES-USER</Text>
          <Text>S2-DEVELOPER-MESSAGE</Text>
          <Text>ERR-ROW-2</Text>
          <Text>ERR-ROW-3</Text>
        </Box>
      ) : null}
    </Box>
  ));
  return {
    App,
    showError,
    lifecycle: () => ({ setups, mounts, unmounts }),
  };
}

test.each([
  { mode: "fullscreen" as const, userHeight: 1, showsEveryErrorRow: true },
  { mode: "inline" as const, userHeight: 1, showsEveryErrorRow: false },
  { mode: "inline" as const, userHeight: 4, showsEveryErrorRow: true },
])(
  "absolute error sibling over a $userHeight-row user tree in $mode: every error row=$showsEveryErrorRow",
  async ({ mode, userHeight, showsEveryErrorRow }) => {
    const probe = createAbsoluteOverlayProbe(userHeight);
    const result = await render(probe.App, { mode, columns: 40, rows: 8 });
    try {
      expect(result.lastFrame()).toContain("USER-ID-1-STATE-7");
      probe.showError.value = true;
      await nextTick();
      await result.waitUntilRenderFlush();

      const frame = result.lastFrame();
      const screen = (await result.screen()).lines.join("\n");
      expect(frame).toContain("ERR-ROW-0-OVERWRITES-USER");
      expect(frame).not.toContain("USER-ID-1-STATE-7");
      if (showsEveryErrorRow) {
        expect(frame).toContain("S2-DEVELOPER-MESSAGE");
        expect(frame).toContain("ERR-ROW-2");
        expect(frame).toContain("ERR-ROW-3");
        expect(screen).toContain("S2-DEVELOPER-MESSAGE");
      } else {
        expect(frame).not.toContain("S2-DEVELOPER-MESSAGE");
        expect(frame).not.toContain("ERR-ROW-2");
        expect(frame).not.toContain("ERR-ROW-3");
        expect(screen).not.toContain("S2-DEVELOPER-MESSAGE");
      }
      expect(probe.lifecycle()).toEqual({ setups: 1, mounts: 1, unmounts: 0 });

      probe.showError.value = false;
      await nextTick();
      await result.waitUntilRenderFlush();
      expect(result.lastFrame()).toContain("USER-ID-1-STATE-7");
      expect(probe.lifecycle()).toEqual({ setups: 1, mounts: 1, unmounts: 0 });
    } finally {
      result.dispose();
    }
  },
);

test("a flow error sibling extends a one-row Inline tree without replacing it", async () => {
  const showError = shallowRef(false);
  let setups = 0;
  let mounts = 0;
  let unmounts = 0;
  const UserTree = defineComponent(() => {
    setups += 1;
    onMounted(() => mounts++);
    onUnmounted(() => unmounts++);
    return () => (
      <Box height={1}>
        <Text>INLINE-USER-STATE-7</Text>
      </Box>
    );
  });
  const App = defineComponent(() => () => (
    <Box flexDirection="column">
      <UserTree />
      {showError.value ? (
        <Box flexDirection="column">
          <Text>ERR-ROW-0</Text>
          <Text>INLINE-DEVELOPER-MESSAGE</Text>
          <Text>ERR-ROW-2</Text>
          <Text>ERR-ROW-3</Text>
        </Box>
      ) : null}
    </Box>
  ));
  const result = await render(App, { mode: "inline", columns: 40, rows: 8 });
  try {
    showError.value = true;
    await nextTick();
    await result.waitUntilRenderFlush();

    const frame = result.lastFrame();
    const screen = (await result.screen()).lines.join("\n");
    expect(frame).toContain("INLINE-USER-STATE-7");
    expect(frame).toContain("INLINE-DEVELOPER-MESSAGE");
    expect(frame).toContain("ERR-ROW-3");
    expect(screen).toContain("INLINE-USER-STATE-7");
    expect(screen).toContain("INLINE-DEVELOPER-MESSAGE");
    expect({ setups, mounts, unmounts }).toEqual({ setups: 1, mounts: 1, unmounts: 0 });
  } finally {
    result.dispose();
  }
});
