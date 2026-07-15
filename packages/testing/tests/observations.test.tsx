import {
  defineComponent,
  nextTick,
  onMounted,
  shallowRef,
  type ComponentPublicInstance,
} from "vue";
import { expect, test } from "vite-plus/test";
import {
  Box,
  Text,
  useCaret,
  useFocus,
  useStderr,
  useStdout,
  type UseCaretReturn,
} from "@vue-tui/runtime";
import { Static } from "@vue-tui/runtime/inline";
import { render, type ScreenSnapshot } from "../src/index.ts";

function screenText(screen: ScreenSnapshot): string {
  return [...screen.scrollback, ...screen.lines].join("\n");
}

test("content frames and terminal screen are separate observations", async () => {
  let write: ((data: string) => void) | undefined;
  const App = defineComponent(() => {
    write = useStdout().write;
    return () => <Text>content</Text>;
  });
  const result = await render(App);
  const frameCount = result.frames.length;

  write?.("side channel\n");
  const screen = await result.screen();

  expect(result.frames).toHaveLength(frameCount);
  expect(result.lastFrame()).toBe("content");
  expect(screenText(screen)).toContain("side channel");
});

test.each([["stdout", useStdout] as const, ["stderr", useStderr] as const])(
  "unterminated coordinated %s output becomes immutable history",
  async (_name, useStream) => {
    const dynamic = shallowRef("LIVE");
    let write: ((data: string) => void) | undefined;
    const App = defineComponent(() => {
      write = useStream().write;
      return () => <Text>{dynamic.value}</Text>;
    });
    const result = await render(App, { columns: 12, rows: 4 });

    try {
      write?.("COMMITTED");
      dynamic.value = "LATEST";
      await nextTick();
      await result.waitUntilRenderFlush();

      const lines = [...(await result.screen()).scrollback, ...(await result.screen()).lines].map(
        (line) => line.trimEnd(),
      );
      expect(lines.filter((line) => line === "COMMITTED")).toHaveLength(1);
      expect(lines).toContain("LATEST");
      expect(lines).not.toContain("LIVE");
    } finally {
      result.dispose();
    }
  },
);

test("final-stream host writes Static immediately and only the latest dynamic frame at teardown", async () => {
  const items = shallowRef<string[]>([]);
  const dynamic = shallowRef("first");
  const App = defineComponent(() => () => (
    <Box>
      <Static items={items.value}>
        {{ default: ({ item }: { item: string }) => <Text>{item}</Text> }}
      </Static>
      <Text>{dynamic.value}</Text>
    </Box>
  ));
  const result = await render(App, { host: { stdout: "stream" } });

  items.value = ["done"];
  dynamic.value = "second";
  await nextTick();
  await result.waitUntilRenderFlush();
  dynamic.value = "latest";
  await nextTick();
  await result.waitUntilRenderFlush();

  const beforeTeardown = screenText(await result.screen());
  expect(beforeTeardown).toContain("done");
  expect(beforeTeardown).not.toContain("first");
  expect(beforeTeardown).not.toContain("second");
  expect(beforeTeardown).not.toContain("latest");
  expect(result.frames.at(-1)).toEqual({ dynamic: "latest", staticOutput: "" });

  result.unmount();
  const afterTeardown = screenText(await result.screen());
  expect(afterTeardown).toContain("done");
  expect(afterTeardown).toContain("latest");
  expect(afterTeardown).not.toContain("first");
  expect(afterTeardown).not.toContain("second");
});

test("Fullscreen screen uses alternate buffer and restores normal buffer on unmount", async () => {
  const result = await render(() => <Text>FULLSCREEN</Text>, {
    columns: 24,
    rows: 5,
    host: { mode: "fullscreen" },
  });

  const mounted = await result.screen();
  expect(mounted.activeBuffer).toBe("alternate");
  expect(mounted.lines).toHaveLength(5);
  expect(screenText(mounted)).toContain("FULLSCREEN");

  result.unmount();
  const restored = await result.screen();
  expect(restored.activeBuffer).toBe("normal");
  expect(screenText(restored)).not.toContain("FULLSCREEN");
});

test("Static delta is structured separately from the dynamic region", async () => {
  const items = shallowRef<string[]>([]);
  const result = await render(
    defineComponent(() => () => (
      <Box>
        <Static items={items.value}>
          {{ default: ({ item }: { item: string }) => <Text>{item}</Text> }}
        </Static>
        <Text>live</Text>
      </Box>
    )),
  );

  items.value = ["history"];
  await nextTick();
  await result.waitUntilRenderFlush();

  expect(result.frames).toContainEqual({ dynamic: "live", staticOutput: "history\n" });
});

test("content frames retain renderer styling but exclude writer and lifecycle controls", async () => {
  const result = await render(
    defineComponent(() => {
      const { write } = useStdout();
      onMounted(() => write("external\n"));
      return () => <Text>{"\x1b[31mframe\x1b[39m"}</Text>;
    }),
    { host: { mode: "fullscreen" } },
  );

  expect(result.lastFrame({ raw: true })).toMatch(/\x1b\[[0-9;]*m/);
  const writerControls = [
    "\x1b[?1049h",
    "\x1b[?1049l",
    "\x1b[2J",
    "\x1b[H",
    "\x1b[?25h",
    "\x1b[?25l",
    "\x1b[?2026h",
    "\x1b[?2026l",
  ];
  for (const frame of result.frames) {
    for (const content of [frame.dynamic, frame.staticOutput]) {
      for (const control of writerControls) expect(content).not.toContain(control);
      expect(content).not.toContain("external");
    }
  }
});

test("TTY screen output applies newline line discipline", async () => {
  const result = await render(() => <Text>{"A\nB"}</Text>, { columns: 8, rows: 3 });
  const screen = await result.screen();

  expect(screen.lines.slice(0, 2).map((line) => line.trimEnd())).toEqual(["A", "B"]);
});

test("stream screen output preserves raw LF cursor movement", async () => {
  const result = await render(() => <Text>{"A\nB"}</Text>, {
    columns: 8,
    rows: 3,
    host: { stdout: "stream" },
  });

  result.unmount();
  const screen = await result.screen();
  expect(screen.lines.slice(0, 2).map((line) => line.trimEnd())).toEqual(["A", " B"]);
});

test("screen observes useCaret becoming visible and inactive", async () => {
  const position = shallowRef<{ x: number; y: number } | null>({ x: 1, y: 0 });
  let caret!: UseCaretReturn;
  const App = defineComponent(() => {
    const target = shallowRef<ComponentPublicInstance | null>(null);
    const focus = useFocus(target, { autoFocus: true });
    caret = useCaret(target, { focus, position });
    return () => <Text ref={target}>abc</Text>;
  });
  const result = await render(App, {
    columns: 10,
    rows: 3,
    host: { mode: "fullscreen" },
  });

  try {
    expect(caret.state.value.status).toBe("visible");
    expect((await result.screen()).cursor.visible).toBe(true);

    position.value = null;
    await nextTick();
    await result.waitUntilRenderFlush();

    expect(caret.state.value).toEqual({ status: "inactive" });
    expect((await result.screen()).cursor.visible).toBe(false);
  } finally {
    result.dispose();
  }
});
