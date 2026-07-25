import { test, expect, vi } from "vite-plus/test";
import { devPlugin } from "./dev.ts";
import { vueTui } from "./index.ts";
import * as publicApi from "./index.ts";
import { DEV_VMOD_ID } from "./dev-vmod.ts";
import { moduleIdMatchesConfiguredEntry, resolveConfiguredEntry } from "./entry-match.ts";

// Vite's transform hook receives an ABSOLUTE fs path. After configResolved, the
// configured entry is resolved against the Vite root and matched exactly — never
// by path suffix.
type TransformFn = (this: unknown, code: string, id: string) => { code: string } | undefined;
type ConfigResolvedFn = (this: unknown, config: { root: string; plugins: unknown[] }) => void;
type ConfigFn = () => {
  clearScreen: boolean;
  logLevel: string;
  server: { ws: boolean };
};
const injectPrefix = `import ${JSON.stringify(DEV_VMOD_ID)};\n`;

test("the package root exposes only the Vite plugin", () => {
  expect(Object.keys(publicApi).sort()).toEqual(["default", "vueTui"]);
});

test("keeps Vite error diagnostics enabled for failures without an HMR payload", () => {
  const plugin = devPlugin({
    session: { sessionId: "test-session" },
  }) as unknown as { config: ConfigFn };

  expect(plugin.config()).toEqual({
    clearScreen: false,
    logLevel: "error",
    server: { ws: false },
  });
});

test("still reports an unavailable runnable SSR environment", async () => {
  const plugin = devPlugin({
    session: { sessionId: "non-runnable-session" },
  }) as unknown as {
    configureServer(server: import("vite").ViteDevServer): (() => void) | undefined;
  };
  const originalClose = vi.fn(async () => {});
  const server = {
    environments: {},
    config: { logger: { error: vi.fn() } },
    ws: { send: vi.fn() },
    bindCLIShortcuts: vi.fn(),
    close: originalClose,
  } as unknown as import("vite").ViteDevServer;
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

  try {
    plugin.configureServer(server)?.();
    expect(consoleError).toHaveBeenCalledWith('[vue-tui] the "ssr" environment is not runnable');
  } finally {
    consoleError.mockRestore();
    await server.close();
  }
});

test("correlates an HMR error with its own overlapping file-change batch", async () => {
  const plugin = devPlugin({
    session: { sessionId: "overlapping-update-session" },
  }) as unknown as {
    hotUpdate: {
      handler(options: {
        type: "update";
        file: string;
        timestamp: number;
        modules: [];
        read: () => string;
        server: import("vite").ViteDevServer;
      }): void;
    };
    configureServer(server: import("vite").ViteDevServer): void;
  };
  const ssrSend = vi.fn();
  const originalClose = vi.fn(async () => {});
  const server = {
    environments: {
      ssr: {
        hot: {
          on: vi.fn(),
          send: ssrSend,
        },
      },
    },
    ws: { send: vi.fn() },
    bindCLIShortcuts: vi.fn(),
    close: originalClose,
  } as unknown as import("vite").ViteDevServer;
  plugin.configureServer(server);

  let releaseFirst!: () => void;
  const firstMayFinish = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  let markFirstStarted!: () => void;
  const firstStarted = new Promise<void>((resolve) => {
    markFirstStarted = resolve;
  });
  const first = Promise.resolve().then(async () => {
    plugin.hotUpdate.handler({
      type: "update",
      file: "/src/first.vue",
      timestamp: 101,
      modules: [],
      read: () => "",
      server,
    });
    markFirstStarted();
    await firstMayFinish;
    server.ws.send({
      type: "error",
      err: {
        message: "first failed",
        stack: "first failed\n    at first.vue",
        id: "/src/first.vue",
      },
    });
  });

  try {
    await firstStarted;
    await Promise.resolve().then(() => {
      plugin.hotUpdate.handler({
        type: "update",
        file: "/src/second.vue",
        timestamp: 202,
        modules: [],
        read: () => "",
        server,
      });
    });
    releaseFirst();
    await first;

    expect(ssrSend.mock.calls.slice(0, 2)).toEqual([
      ["vue-tui:hmr-error-context", { timestamp: 101 }],
      [
        {
          type: "error",
          err: {
            message: "first failed",
            stack: "first failed\n    at first.vue",
            id: "/src/first.vue",
          },
        },
      ],
    ]);
  } finally {
    releaseFirst();
    await first;
    await server.close();
  }
});

function transformOf(opts: { entry?: string; root?: string }): TransformFn {
  const plugin = devPlugin({
    entry: opts.entry ?? "/src/main.ts",
    session: { sessionId: "test-session" },
  }) as unknown as { transform: TransformFn; configResolved: ConfigResolvedFn };
  plugin.configResolved({ root: opts.root ?? "/Users/proj", plugins: [] });
  return plugin.transform;
}

test("injects the dev module into a CUSTOM entry matched by absolute path", () => {
  const transform = transformOf({ entry: "/src/app.ts" });
  const out = transform("export const x = 1;", "/Users/proj/src/app.ts");
  expect(out?.code).toBe(`${injectPrefix}export const x = 1;`);
});

test("injects the dev module into the DEFAULT entry", () => {
  const transform = transformOf({});
  const out = transform("export const x = 1;", "/Users/proj/src/main.ts");
  expect(out?.code).toBe(`${injectPrefix}export const x = 1;`);
});

test("does not inject into non-entry modules", () => {
  const transform = transformOf({ entry: "/src/app.ts" });
  expect(transform("export const x = 1;", "/Users/proj/src/other.ts")).toBeUndefined();
});

test("strips the query suffix before matching the entry", () => {
  const transform = transformOf({});
  const out = transform("export const x = 1;", "/Users/proj/src/main.ts?vue&type=script");
  expect(out?.code).toBe(`${injectPrefix}export const x = 1;`);
});

test("does not inject into an unrelated path that only shares the entry suffix", () => {
  const transform = transformOf({ entry: "/src/main.ts", root: "/Users/proj/app" });
  // endsWith("/src/main.ts") would wrongly match this vendor path
  expect(
    transform("export const x = 1;", "/Users/proj/app/vendor/pkg/src/main.ts"),
  ).toBeUndefined();
  // The real configured entry still matches
  const out = transform("export const x = 1;", "/Users/proj/app/src/main.ts");
  expect(out?.code).toBe(`${injectPrefix}export const x = 1;`);
});

test("resolveConfiguredEntry handles relative, root-relative, and absolute forms", () => {
  const root = "/Users/proj/app";
  expect(resolveConfiguredEntry(root, "/src/main.ts")).toBe("/Users/proj/app/src/main.ts");
  expect(resolveConfiguredEntry(root, "/Users/proj/app/src/custom.ts")).toBe(
    "/Users/proj/app/src/custom.ts",
  );
  expect(
    moduleIdMatchesConfiguredEntry(
      "/Users/proj/app/src/main.ts?v=1",
      "/Users/proj/app/src/main.ts",
    ),
  ).toBe(true);
  expect(
    moduleIdMatchesConfiguredEntry(
      "/Users/proj/app/vendor/pkg/src/main.ts",
      "/Users/proj/app/src/main.ts",
    ),
  ).toBe(false);
});

// vueTui() normalizes the dev `entry` so the dev plugin injects the HMR snippet on
// the exact resolved absolute path. Rooted forms — a leading "/" (root-relative /
// POSIX-absolute / UNC) or a Windows drive-letter — pass through unchanged; relative forms
// ("./src/x") get a leading slash.
const ENTRY_CASES = [
  {
    name: "'./'-relative",
    entry: "./src/app.ts",
    root: "/Users/proj",
    id: "/Users/proj/src/app.ts",
  },
  {
    name: "Windows drive-letter",
    entry: "C:/proj/src/main.ts",
    root: "C:/proj",
    id: "C:/proj/src/main.ts",
  },
  {
    name: "Windows UNC",
    entry: "\\\\server\\share\\src\\main.ts",
    root: "//server/share",
    id: "//server/share/src/main.ts",
  },
  {
    name: "POSIX-absolute",
    entry: "/Users/proj/app/src/main.ts",
    root: "/Users/proj/app",
    id: "/Users/proj/app/src/main.ts",
  },
  {
    name: "custom relative",
    entry: "src/boot.ts",
    root: "/Users/proj",
    id: "/Users/proj/src/boot.ts",
  },
];

test.each(ENTRY_CASES)(
  "vueTui normalizes a $name entry so dev injects on the module id",
  ({ entry, root, id }) => {
    const plugins = vueTui({ entry });
    const dev = plugins.find((p) => p.name === "vue-tui:dev") as unknown as {
      transform: TransformFn;
      configResolved: ConfigResolvedFn;
    };
    dev.configResolved({ root, plugins: [] });
    expect(dev.transform("export const x = 1;", id)?.code).toBe(
      `${injectPrefix}export const x = 1;`,
    );
  },
);
