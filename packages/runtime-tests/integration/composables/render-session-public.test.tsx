import { PassThrough } from "node:stream";
import { defineComponent } from "vue";
import { expect, test, vi } from "vite-plus/test";
import { render, type RenderOptions } from "@vue-tui/testing";
import {
  createApp,
  renderToString,
  Text,
  useLayoutWidth,
  useViewportHeight,
} from "@vue-tui/runtime";
import {
  INTERNAL_TERMINAL_SIZE_PROBE,
  renderToStringWithScreenReader,
} from "@vue-tui/runtime/internal";

function makePublicTty(columns?: number, rows?: number): NodeJS.WriteStream {
  const stream = new PassThrough() as unknown as NodeJS.WriteStream;
  Object.assign(stream, { isTTY: true });
  if (columns !== undefined) stream.columns = columns;
  if (rows !== undefined) stream.rows = rows;
  return stream;
}

function makePublicStdin(): NodeJS.ReadStream {
  const stream = new PassThrough() as unknown as NodeJS.ReadStream;
  Object.assign(stream, {
    isTTY: true,
    isRaw: false,
    setRawMode(this: NodeJS.ReadStream & { isRaw: boolean }, mode: boolean) {
      this.isRaw = mode;
      return this;
    },
    setEncoding(this: NodeJS.ReadStream) {
      return this;
    },
    ref() {},
    unref() {},
  });
  return stream;
}

const unboundedLiveCases: readonly {
  readonly name: string;
  readonly options: RenderOptions;
}[] = [
  {
    name: "screen-reader Inline TTY",
    options: {
      columns: 80,
      rows: 24,
      host: { mode: "inline", presentation: "screen-reader" },
    },
  },
  {
    name: "screen-reader Fullscreen request",
    options: {
      columns: 80,
      rows: 24,
      host: { mode: "fullscreen", presentation: "screen-reader" },
    },
  },
  {
    name: "final stream",
    options: {
      columns: 80,
      rows: 24,
      host: { mode: "fullscreen", stdout: "stream", updates: "at-teardown" },
    },
  },
  {
    name: "live stream",
    options: {
      columns: 80,
      rows: 24,
      host: { mode: "fullscreen", stdout: "stream", updates: "live" },
    },
  },
];

test.each(unboundedLiveCases)(
  "$name exposes a layout width but no finite visual viewport",
  async ({ options }) => {
    let width: ReturnType<typeof useLayoutWidth> | undefined;
    let viewportHeight: ReturnType<typeof useViewportHeight> | undefined;
    const App = defineComponent(() => {
      width = useLayoutWidth();
      viewportHeight = useViewportHeight();
      return () => <Text>{`${width!.value}x${viewportHeight?.value ?? "unbounded"}`}</Text>;
    });

    const result = await render(App, options);
    expect(width!.value).toBe(80);
    expect(viewportHeight).toBeNull();
    expect(result.lastFrame()).toBe("80xunbounded");
    result.dispose();
  },
);

test("an unavailable terminal size keeps width usable and gates viewport behavior", async () => {
  const stdout = makePublicTty();
  const stderr = makePublicTty();
  const stdin = makePublicStdin();
  let width: ReturnType<typeof useLayoutWidth> | undefined;
  let viewportHeight: ReturnType<typeof useViewportHeight> | undefined;
  const App = defineComponent(() => {
    width = useLayoutWidth();
    viewportHeight = useViewportHeight();
    return () => <Text>unavailable</Text>;
  });
  const app = createApp(App);

  try {
    app.mount({
      stdout,
      stderr,
      stdin,
      mode: "fullscreen",
      liveUpdates: true,
      maxFps: 0,
      patchConsole: false,
      [INTERNAL_TERMINAL_SIZE_PROBE]: () => ({ kind: "unavailable" }),
    } as Parameters<typeof app.mount>[0]);

    expect(width!.value).toBe(80);
    expect(viewportHeight).toBeNull();
  } finally {
    app.unmount();
    await app.waitUntilExit();
    stdin.destroy();
    stdout.destroy();
    stderr.destroy();
  }
});

test("disabling live updates makes the visual layout unbounded even when terminal rows are known", async () => {
  const stdout = makePublicTty(80, 24);
  const stderr = makePublicTty(80, 24);
  const stdin = makePublicStdin();
  let width: ReturnType<typeof useLayoutWidth> | undefined;
  let viewportHeight: ReturnType<typeof useViewportHeight> | undefined;
  const App = defineComponent(() => {
    width = useLayoutWidth();
    viewportHeight = useViewportHeight();
    return () => <Text>final</Text>;
  });
  const app = createApp(App);

  try {
    app.mount({
      stdout,
      stderr,
      stdin,
      mode: "fullscreen",
      liveUpdates: false,
      maxFps: 0,
      patchConsole: false,
    });

    expect(width!.value).toBe(80);
    expect(viewportHeight).toBeNull();
  } finally {
    app.unmount();
    await app.waitUntilExit();
    stdin.destroy();
    stdout.destroy();
    stderr.destroy();
  }
});

test("bounded layout refs reject runtime mutation", async () => {
  let width: ReturnType<typeof useLayoutWidth> | undefined;
  let viewportHeight: ReturnType<typeof useViewportHeight> | undefined;
  const App = defineComponent(() => {
    width = useLayoutWidth();
    viewportHeight = useViewportHeight();
    return () => <Text>{width!.value}</Text>;
  });
  const result = await render(App, { columns: 80, rows: 24 });
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

  try {
    (width as { value: number }).value = 1;
    (viewportHeight as { value: number }).value = 1;

    expect(width!.value).toBe(80);
    expect(viewportHeight!.value).toBe(24);
    expect(warn).toHaveBeenCalled();
  } finally {
    warn.mockRestore();
    result.dispose();
  }
});

test("layout primitives fail clearly outside a vue-tui render tree", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  try {
    expect(() => useLayoutWidth()).toThrow(
      "render session is unavailable outside a vue-tui render tree",
    );
    expect(() => useViewportHeight()).toThrow(
      "render session is unavailable outside a vue-tui render tree",
    );
  } finally {
    warn.mockRestore();
  }
});

test.each([
  ["visual", renderToString],
  ["screen-reader", renderToStringWithScreenReader],
] as const)(
  "the %s string host exposes width without a finite viewport",
  (_name, renderDocument) => {
    let width: ReturnType<typeof useLayoutWidth> | undefined;
    let viewportHeight: ReturnType<typeof useViewportHeight> | undefined;
    const App = defineComponent(() => {
      width = useLayoutWidth();
      viewportHeight = useViewportHeight();
      return () => <Text>{`${width!.value}x${viewportHeight?.value ?? "unbounded"}`}</Text>;
    });

    expect(renderDocument(App, { columns: 37 })).toBe("37xunbounded");
    expect(width!.value).toBe(37);
    expect(viewportHeight).toBeNull();
  },
);
