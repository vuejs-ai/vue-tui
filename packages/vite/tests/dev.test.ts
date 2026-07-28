import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect, vi } from "vite-plus/test";
import type { Plugin } from "vite";
import { VueTuiDevSessionConflictError } from "@vue-tui/runtime/internal/devtools";
import { devPlugin } from "../src/dev.ts";
import { vueTui } from "../src/index.ts";
import * as publicApi from "../src/index.ts";
import { DEV_VMOD_ID } from "../src/dev-vmod.ts";
import { moduleIdMatchesConfiguredEntry, resolveConfiguredEntry } from "../src/entry-match.ts";

// Vite's transform hook receives an ABSOLUTE fs path. After configResolved, the
// configured entry is resolved against the Vite root and matched exactly — never
// by path suffix.
type TransformFn = (this: unknown, code: string, id: string) => { code: string } | undefined;
type CompilerHook = (this: unknown, ...args: unknown[]) => unknown;
type ConfigResolvedFn = (
  this: unknown,
  config: {
    root: string;
    plugins: Plugin[];
    resolve: { preserveSymlinks: boolean };
  },
) => void;
type ConfigFn = () => {
  clearScreen: boolean;
  logLevel: string;
  server: { ws: boolean };
};
type HotUpdateHook = {
  order: string;
  handler(options: { type: string; file: string; timestamp: number }): void;
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

test("classifies a watcher task in the pre hook before compilers run", () => {
  const observe = vi.fn();
  const plugin = devPlugin({
    session: { sessionId: "watcher-classification-session" },
    watcherUpdates: { observe, isDuplicate: () => false },
  });
  const hook = plugin.hotUpdate as unknown as HotUpdateHook;
  const update = { type: "update", file: "/src/app.vue", timestamp: 101 };

  expect(hook.order).toBe("pre");
  hook.handler(update);
  expect(observe).toHaveBeenCalledWith(update);
});

test("replaces Vite's CLI shortcut binder before the TUI takes over stdin", async () => {
  const plugin = devPlugin({
    session: { sessionId: "shortcut-neutralization-session" },
  }) as unknown as {
    configureServer(server: import("vite").ViteDevServer): void;
  };
  const originalBindCLIShortcuts = vi.fn();
  const originalClose = vi.fn(async () => {});
  const server = {
    environments: {
      ssr: {
        hot: {
          on: vi.fn(),
          send: vi.fn(),
        },
      },
    },
    ws: { send: vi.fn() },
    bindCLIShortcuts: originalBindCLIShortcuts,
    close: originalClose,
  } as unknown as import("vite").ViteDevServer;

  try {
    plugin.configureServer(server);
    server.bindCLIShortcuts();
    expect(originalBindCLIShortcuts).not.toHaveBeenCalled();
  } finally {
    await server.close();
  }
});

test("follows Vite's preserveSymlinks policy at both HMR path seams", async () => {
  const sandbox = mkdtempSync(join(tmpdir(), "vue-tui-preserve-symlinks-"));
  const physicalRoot = join(sandbox, "physical");
  const linkedRoot = join(sandbox, "linked");
  try {
    mkdirSync(join(physicalRoot, "src"), { recursive: true });
    writeFileSync(join(physicalRoot, "src/main.ts"), "export {};\n");
    writeFileSync(join(physicalRoot, "src/app.vue"), "<template />\n");
    symlinkSync(physicalRoot, linkedRoot, process.platform === "win32" ? "junction" : "dir");

    const plugin = devPlugin({
      entry: "/src/main.ts",
      session: { sessionId: "preserve-symlinks-session" },
    }) as unknown as {
      configResolved: ConfigResolvedFn;
      configureServer(server: import("vite").ViteDevServer): void;
      transform: TransformFn;
    };
    plugin.configResolved({
      root: linkedRoot,
      plugins: [],
      resolve: { preserveSymlinks: true },
    });

    expect(plugin.transform("export {};", join(linkedRoot, "src/main.ts"))?.code).toBe(
      `${injectPrefix}export {};`,
    );
    expect(plugin.transform("export {};", join(physicalRoot, "src/main.ts"))).toBeUndefined();

    const ssrSend = vi.fn();
    const server = {
      environments: { ssr: { hot: { on: vi.fn(), send: ssrSend } } },
      ws: { send: vi.fn() },
      bindCLIShortcuts: vi.fn(),
      close: vi.fn(async () => {}),
    } as unknown as import("vite").ViteDevServer;
    plugin.configureServer(server);
    const linkedFile = join(linkedRoot, "src/app.vue");
    server.ws.send({ type: "custom", event: "file-changed", data: { file: linkedFile } });
    expect(ssrSend).toHaveBeenCalledWith({
      type: "custom",
      event: "file-changed",
      data: { file: linkedFile },
    });
    await server.close();
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
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

test("closes a server rejected by the Runtime ownership boundary", async () => {
  const plugin = devPlugin({
    session: { sessionId: "runtime-conflict-session" },
  }) as unknown as {
    configureServer(server: import("vite").ViteDevServer): (() => void) | undefined;
  };
  const importEntry = vi.fn(async () => {
    throw new VueTuiDevSessionConflictError();
  });
  const { createRunnableDevEnvironment, resolveConfig } = await import("vite");
  const resolved = await resolveConfig(
    { optimizeDeps: { noDiscovery: true } },
    "serve",
    "development",
  );
  const environment = createRunnableDevEnvironment("ssr", resolved, {
    hot: false,
    runner: () => ({ import: importEntry }) as never,
  });
  const originalClose = vi.fn(async () => {});
  const server = {
    environments: { ssr: environment },
    ws: { send: vi.fn() },
    bindCLIShortcuts: vi.fn(),
    close: originalClose,
  } as unknown as import("vite").ViteDevServer;
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

  try {
    plugin.configureServer(server)?.();
    await vi.waitFor(() => expect(originalClose).toHaveBeenCalledOnce());
    expect(importEntry).toHaveBeenCalledOnce();
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining("another Vite dev session is already active"),
    );
  } finally {
    consoleError.mockRestore();
  }
});

function configResolvedHook(): ConfigResolvedFn {
  const plugin = devPlugin({
    session: { sessionId: "compiler-config-session" },
  }) as unknown as { configResolved: ConfigResolvedFn };
  return plugin.configResolved;
}

test("leaves the supported SFC compiler hooks unchanged", () => {
  const transform: CompilerHook = () => null;
  const loadHandler: CompilerHook = () => null;
  const sfcCompiler = {
    name: "unplugin-vue",
    transform,
    load: { handler: loadHandler },
  } as unknown as Plugin & {
    transform: CompilerHook;
    load: { handler: CompilerHook };
  };

  configResolvedHook()({
    root: "/Users/proj",
    plugins: [sfcCompiler],
    resolve: { preserveSymlinks: false },
  });

  expect(sfcCompiler.transform).toBe(transform);
  expect(sfcCompiler.load.handler).toBe(loadHandler);
});

test("rejects unplugin-vue when it is explicitly configured for SSR output", () => {
  const error = unsupportedCompilerError({
    name: "unplugin-vue",
    api: { options: { ssr: true } },
  } as unknown as Plugin);

  expect(error.name).toBe("VueTuiUnsupportedCompilerError");
  expect(error.message).toContain("ssr: false");
});

test("patches only @vitejs/plugin-vue-jsx, including its object transform hook", () => {
  let seenSsr: boolean | undefined;
  const transformHandler: CompilerHook = (...args: unknown[]) => {
    const options = args[2] as { ssr?: boolean } | undefined;
    seenSsr = options?.ssr;
    return null;
  };
  const jsxCompiler = {
    name: "vite:vue-jsx",
    transform: { handler: transformHandler },
  } as unknown as Plugin & {
    transform: { handler: CompilerHook };
  };

  configResolvedHook()({
    root: "/Users/proj",
    plugins: [jsxCompiler],
    resolve: { preserveSymlinks: false },
  });

  expect(jsxCompiler.transform.handler).not.toBe(transformHandler);
  jsxCompiler.transform.handler.call({}, "code", "/Users/proj/src/app.tsx", { ssr: true });
  expect(seenSsr).toBe(false);
});

function unsupportedCompilerError(plugin: Plugin): Error {
  try {
    configResolvedHook()({
      root: "/Users/proj",
      plugins: [plugin],
      resolve: { preserveSymlinks: false },
    });
  } catch (error) {
    if (error instanceof Error) return error;
    throw error;
  }
  throw new Error(`Expected compiler ${plugin.name} to be rejected`);
}

test("rejects @vitejs/plugin-vue at config time without patching it", () => {
  const transform: CompilerHook = () => null;
  const compiler = {
    name: "vite:vue",
    transform,
  } as unknown as Plugin & {
    transform: CompilerHook;
  };

  const error = unsupportedCompilerError(compiler);

  expect(error.name).toBe("VueTuiUnsupportedCompilerError");
  expect(error.message).toContain("@vitejs/plugin-vue");
  expect(error.message).toContain("unplugin-vue/vite");
  expect(compiler.transform).toBe(transform);
});

test("rejects unplugin-vue-jsx at config time with the HMR-capable alternative", () => {
  const error = unsupportedCompilerError({
    name: "unplugin-vue-jsx",
  });

  expect(error.name).toBe("VueTuiUnsupportedCompilerError");
  expect(error.message).toContain("unplugin-vue-jsx");
  expect(error.message).toContain("@vitejs/plugin-vue-jsx");
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
            phase: "compile",
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
  plugin.configResolved({
    root: opts.root ?? "/Users/proj",
    plugins: [],
    resolve: { preserveSymlinks: false },
  });
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

test("keeps an existing absolute entry outside the Vite root", () => {
  const sandbox = mkdtempSync(join(tmpdir(), "vue-tui-external-entry-"));
  const root = join(sandbox, "project");
  const entry = join(sandbox, "external/main.ts");
  try {
    mkdirSync(root, { recursive: true });
    mkdirSync(join(sandbox, "external"), { recursive: true });
    writeFileSync(entry, "export const external = true;\n");

    expect(resolveConfiguredEntry(root, entry)).toBe(entry);
    expect(transformOf({ entry, root })("export const external = true;", entry)?.code).toBe(
      `${injectPrefix}export const external = true;`,
    );
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test("matches an entry reached through an equivalent filesystem link", () => {
  const root = mkdtempSync(join(tmpdir(), "vue-tui-entry-match-"));
  const physicalRoot = join(root, "physical");
  const linkedRoot = join(root, "linked");
  const physicalEntry = join(physicalRoot, "src/main.ts");
  try {
    mkdirSync(join(physicalRoot, "src"), { recursive: true });
    writeFileSync(physicalEntry, "export {};\n");
    symlinkSync(physicalRoot, linkedRoot, process.platform === "win32" ? "junction" : "dir");

    expect(
      moduleIdMatchesConfiguredEntry(`${physicalEntry}?v=1`, join(linkedRoot, "src/main.ts")),
    ).toBe(true);
    expect(
      moduleIdMatchesConfiguredEntry(physicalEntry, join(linkedRoot, "src/main.ts"), true),
    ).toBe(false);
    expect(
      moduleIdMatchesConfiguredEntry(
        join(linkedRoot, "src/main.ts"),
        join(linkedRoot, "src/main.ts"),
        true,
      ),
    ).toBe(true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
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
    dev.configResolved({ root, plugins: [], resolve: { preserveSymlinks: false } });
    expect(dev.transform("export const x = 1;", id)?.code).toBe(
      `${injectPrefix}export const x = 1;`,
    );
  },
);
