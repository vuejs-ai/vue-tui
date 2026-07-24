import { PassThrough } from "node:stream";
import { defineComponent } from "vue";
import { expect, test, vi } from "vite-plus/test";
import { render, type RenderOptions } from "@vue-tui/testing";
import { createApp, renderToString, Text, useLayoutSize } from "@vue-tui/runtime";
import { INTERNAL_TERMINAL_SIZE_PROBE } from "../../../runtime/dist/internal.mjs";
import { createInternalMountOptions } from "../../../runtime/dist/internal.mjs";

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
    name: "final stream",
    options: {
      columns: 80,
      rows: 24,
      host: { mode: "inline", stdout: "stream" },
    },
  },
];

test.each(unboundedLiveCases)(
  "$name exposes the fixed modeled document layout",
  async ({ options }) => {
    let layout: ReturnType<typeof useLayoutSize> | undefined;
    const App = defineComponent(() => {
      layout = useLayoutSize();
      return () => <Text>{`${layout!.width.value}x${layout!.height.value}`}</Text>;
    });

    const result = await render(App, options);
    expect(layout!.width.value).toBe(80);
    expect(layout!.height.value).toBe(24);
    expect(result.lastFrame()).toBe("80x24");
    result.dispose();
  },
);

test("an unavailable live terminal size falls back to a finite modeled layout", async () => {
  const stdout = makePublicTty();
  const stderr = makePublicTty();
  const stdin = makePublicStdin();
  let layout: ReturnType<typeof useLayoutSize> | undefined;
  const App = defineComponent(() => {
    layout = useLayoutSize();
    return () => <Text>unavailable</Text>;
  });
  const app = createApp(App);

  try {
    app.mount(
      createInternalMountOptions({
        stdout,
        stderr,
        stdin,
        mode: "inline",
        liveUpdates: true,
        maxFps: 0,
        patchConsole: false,
        [INTERNAL_TERMINAL_SIZE_PROBE]: () => ({ kind: "unavailable" }),
      }),
    );

    expect(layout!.width.value).toBe(80);
    expect(layout!.height.value).toBe(24);
  } finally {
    app.unmount();
    await app.waitUntilExit();
    stdin.destroy();
    stdout.destroy();
    stderr.destroy();
  }
});

test("Fullscreen remains bounded when liveUpdates is false", async () => {
  const stdout = makePublicTty(80, 24);
  const stderr = makePublicTty(80, 24);
  const stdin = makePublicStdin();
  let layout: ReturnType<typeof useLayoutSize> | undefined;
  const App = defineComponent(() => {
    layout = useLayoutSize();
    return () => <Text>final</Text>;
  });
  const app = createApp(App);

  try {
    app.mount(
      createInternalMountOptions({
        stdout,
        stderr,
        stdin,
        mode: "fullscreen",
        liveUpdates: false,
        maxFps: 0,
        patchConsole: false,
      }),
    );

    expect(layout!.width.value).toBe(80);
    expect(layout!.height.value).toBe(24);
  } finally {
    app.unmount();
    await app.waitUntilExit();
    stdin.destroy();
    stdout.destroy();
    stderr.destroy();
  }
});

test("bounded layout refs reject runtime mutation", async () => {
  let layout: ReturnType<typeof useLayoutSize> | undefined;
  const App = defineComponent(() => {
    layout = useLayoutSize();
    return () => <Text>{layout!.width.value}</Text>;
  });
  const result = await render(App, { columns: 80, rows: 24 });
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

  try {
    (layout!.width as { value: number }).value = 1;
    (layout!.height as { value: number }).value = 1;

    expect(layout!.width.value).toBe(80);
    expect(layout!.height.value).toBe(24);
    expect(warn).toHaveBeenCalled();
  } finally {
    warn.mockRestore();
    result.dispose();
  }
});

test("layout primitives fail clearly outside a vue-tui render tree", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  try {
    expect(() => useLayoutSize()).toThrow(
      "render session is unavailable outside a vue-tui render tree",
    );
  } finally {
    warn.mockRestore();
  }
});

test("the string host exposes modeled finite layout by default and Infinity when requested", () => {
  let layout: ReturnType<typeof useLayoutSize> | undefined;
  const App = defineComponent(() => {
    layout = useLayoutSize();
    return () => (
      <Text>
        {`${layout!.width.value}x${layout!.height.value === Infinity ? "unbounded" : layout!.height.value}`}
      </Text>
    );
  });

  expect(renderToString(App, { width: 37 })).toBe("37x24");
  expect(layout!.width.value).toBe(37);
  expect(layout!.height.value).toBe(24);

  expect(renderToString(App, { width: 37, height: Infinity })).toBe("37xunbounded");
  expect(layout!.width.value).toBe(37);
  expect(layout!.height.value).toBe(Infinity);
});
