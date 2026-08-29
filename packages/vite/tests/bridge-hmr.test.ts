import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect, vi } from "vite-plus/test";
import { bridgeHmrEventsToRunner } from "../src/bridge-hmr.ts";

test("custom ws payloads are forwarded onto the ssr hot channel", () => {
  const ssrSend = vi.fn();
  const original = vi.fn();
  const server = {
    environments: { ssr: { hot: { send: ssrSend } } },
    ws: { send: original },
  } as unknown as import("vite").ViteDevServer;
  bridgeHmrEventsToRunner(server);
  // unplugin-vue calls ws.send("file-changed", { file }) — the string form
  (server.ws.send as unknown as (e: string, d: unknown) => void)("file-changed", { file: "x.vue" });
  expect(ssrSend).toHaveBeenCalledWith({
    type: "custom",
    event: "file-changed",
    data: { file: "x.vue" },
  });
  expect(original).toHaveBeenCalledWith("file-changed", { file: "x.vue" });
});

test("object-form custom payloads are forwarded onto the ssr hot channel", () => {
  const ssrSend = vi.fn();
  const original = vi.fn();
  const server = {
    environments: { ssr: { hot: { send: ssrSend } } },
    ws: { send: original },
  } as unknown as import("vite").ViteDevServer;
  bridgeHmrEventsToRunner(server);
  const payload = { type: "custom", event: "hmr:update", data: {} } as const;
  server.ws.send(payload);
  expect(ssrSend).toHaveBeenCalledWith({ type: "custom", event: "hmr:update", data: {} });
  expect(original).toHaveBeenCalledWith(payload);
});

test("payloads emitted before the post hook are dropped for a pre-classified duplicate", () => {
  const ssrSend = vi.fn();
  const originalWsSend = vi.fn();
  const server = {
    environments: { ssr: { hot: { send: ssrSend } } },
    ws: { send: originalWsSend },
  } as unknown as import("vite").ViteDevServer;
  bridgeHmrEventsToRunner(server, {
    getUpdateTimestamp: () => 202,
    isDuplicateUpdate: (timestamp) => timestamp === 202,
  });
  const custom = { type: "custom", event: "file-changed", data: { file: "app.vue" } } as const;
  const error = compileError("compiler failed before post");

  server.ws.send(custom);
  server.ws.send(error);
  server.environments.ssr!.hot.send({ type: "full-reload", triggeredBy: "/src/app.vue" });

  expect(ssrSend).not.toHaveBeenCalled();
  expect(originalWsSend.mock.calls).toEqual([[custom], [error]]);
});

test("file-changed reaches the runner through the module's physical path", () => {
  const root = mkdtempSync(join(tmpdir(), "vue-tui-file-changed-"));
  const physicalRoot = join(root, "physical");
  const linkedRoot = join(root, "linked");
  const physicalFile = join(physicalRoot, "src/app.vue");
  try {
    mkdirSync(join(physicalRoot, "src"), { recursive: true });
    writeFileSync(physicalFile, "<template />\n");
    symlinkSync(physicalRoot, linkedRoot, process.platform === "win32" ? "junction" : "dir");

    const ssrSend = vi.fn();
    const original = vi.fn();
    const server = {
      environments: { ssr: { hot: { send: ssrSend } } },
      ws: { send: original },
    } as unknown as import("vite").ViteDevServer;
    bridgeHmrEventsToRunner(server);
    const watchedFile = join(linkedRoot, "src/app.vue");
    server.ws.send({ type: "custom", event: "file-changed", data: { file: watchedFile } });

    expect(ssrSend).toHaveBeenCalledWith({
      type: "custom",
      event: "file-changed",
      data: { file: realpathSync.native(physicalFile) },
    });
    expect(original).toHaveBeenCalledWith({
      type: "custom",
      event: "file-changed",
      data: { file: watchedFile },
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("file-changed preserves Vite's linked spelling when preserveSymlinks is enabled", () => {
  const root = mkdtempSync(join(tmpdir(), "vue-tui-preserved-file-changed-"));
  const physicalRoot = join(root, "physical");
  const linkedRoot = join(root, "linked");
  try {
    mkdirSync(join(physicalRoot, "src"), { recursive: true });
    writeFileSync(join(physicalRoot, "src/app.vue"), "<template />\n");
    symlinkSync(physicalRoot, linkedRoot, process.platform === "win32" ? "junction" : "dir");

    const ssrSend = vi.fn();
    const server = {
      environments: { ssr: { hot: { send: ssrSend } } },
      ws: { send: vi.fn() },
    } as unknown as import("vite").ViteDevServer;
    bridgeHmrEventsToRunner(server, { preserveSymlinks: true });
    const watchedFile = join(linkedRoot, "src/app.vue");
    server.ws.send({ type: "custom", event: "file-changed", data: { file: watchedFile } });

    expect(ssrSend).toHaveBeenCalledWith({
      type: "custom",
      event: "file-changed",
      data: { file: watchedFile },
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("ws error payloads keep their identity and carry an explicit compile phase", () => {
  const ssrSend = vi.fn();
  const original = vi.fn();
  const server = {
    environments: { ssr: { hot: { send: ssrSend } } },
    ws: { send: original },
  } as unknown as import("vite").ViteDevServer;
  bridgeHmrEventsToRunner(server);
  // Vite emits compile/build errors as a typed { type: "error", err } payload. The
  // module runner dispatches `vite:error` from this exact shape, so it must be
  // forwarded as the same object (not re-wrapped) for the dev overlay to render
  // the error; the bridge also marks the phase known at this producer.
  // err.stack is required by Vite's ErrorPayload type, so include it.
  const payload: Extract<import("vite").HotPayload, { type: "error" }> = {
    type: "error",
    err: { message: "boom", stack: "boom\n    at x" },
  };
  server.ws.send(payload);
  expect(ssrSend).toHaveBeenCalledWith(payload);
  expect(original).toHaveBeenCalledWith(payload);
  expect(payload.err.phase).toBe("compile");
});

test("error forwarding identifies the file-change timestamp for the runner", () => {
  const ssrSend = vi.fn();
  const original = vi.fn();
  const server = {
    environments: { ssr: { hot: { send: ssrSend } } },
    ws: { send: original },
  } as unknown as import("vite").ViteDevServer;
  bridgeHmrEventsToRunner(server, { getUpdateTimestamp: () => 42 });
  const payload = {
    type: "error",
    err: { message: "boom", stack: "boom\n    at x" },
  } satisfies import("vite").HotPayload;

  server.ws.send(payload);

  expect(ssrSend.mock.calls).toEqual([["vue-tui:hmr-error-context", { timestamp: 42 }], [payload]]);
  expect(original).toHaveBeenCalledWith(payload);
});

test("direct SSR errors identify their own file-change timestamp", () => {
  const ssrSend = vi.fn();
  const server = {
    environments: { ssr: { hot: { send: ssrSend } } },
    ws: { send: vi.fn() },
  } as unknown as import("vite").ViteDevServer;
  bridgeHmrEventsToRunner(server, { getUpdateTimestamp: () => 42 });
  const payload: Extract<import("vite").HotPayload, { type: "error" }> = {
    type: "error",
    err: { message: "ssr boom", stack: "ssr boom\n    at x" },
  };

  server.environments.ssr!.hot.send(payload);

  expect(ssrSend.mock.calls).toEqual([["vue-tui:hmr-error-context", { timestamp: 42 }], [payload]]);
  expect(payload.err.phase).toBe("compile");
});

test("direct SSR errors preserve an explicit evaluation phase", () => {
  const ssrSend = vi.fn();
  const server = {
    environments: { ssr: { hot: { send: ssrSend } } },
    ws: { send: vi.fn() },
  } as unknown as import("vite").ViteDevServer;
  bridgeHmrEventsToRunner(server);
  const payload = {
    type: "error",
    err: {
      message: "evaluate boom",
      stack: "evaluate boom\n    at x",
      phase: "evaluate",
    },
  } satisfies import("vite").HotPayload;

  server.environments.ssr!.hot.send(payload);

  expect(ssrSend).toHaveBeenCalledWith(payload);
  expect(payload.err.phase).toBe("evaluate");
});

function bridged(timestamp?: number): {
  server: import("vite").ViteDevServer;
  ssrSend: ReturnType<typeof vi.fn>;
} {
  const ssrSend = vi.fn();
  const server = {
    environments: { ssr: { hot: { send: ssrSend } } },
    ws: { send: vi.fn() },
  } as unknown as import("vite").ViteDevServer;
  bridgeHmrEventsToRunner(server, { getUpdateTimestamp: () => timestamp });
  return { server, ssrSend };
}

function compileError(message: string): Extract<import("vite").HotPayload, { type: "error" }> {
  return { type: "error", err: { message, stack: `${message}\n    at x` } };
}

// One SFC typo produces exactly two of these — measured, not assumed: Vite
// reports the compile failure for the client environment (which arrives through
// the ws forward) and again for the SSR environment, whose hotUpdate the source
// preflight rejects. Two identical Build Error panels for one mistake.
test("the same failure arriving from both environments is delivered once", () => {
  const { server, ssrSend } = bridged(101);
  const fromClient = compileError("[vue/compiler-sfc] Unexpected token (7:33)");
  const fromSsr = compileError("[vue/compiler-sfc] Unexpected token (7:33)");

  server.ws.send(fromClient);
  server.environments.ssr!.hot.send(fromSsr);

  expect(ssrSend.mock.calls).toEqual([
    ["vue-tui:hmr-error-context", { timestamp: 101 }],
    [fromClient],
  ]);
});

// Captured from one real unplugin-vue syntax error. Vite's client payload uses an
// empty frame while the SSR preflight supplies source context plus plugin/id, so
// an absent frame is `""` here, not `undefined`, and matching on `undefined` alone
// leaves this production pair unmatched.
test("the measured client and SSR payload shapes are paired", () => {
  const { server, ssrSend } = bridged(1785293748167);
  const message = "[vue/compiler-sfc] Unexpected token (7:33)";
  const fromClient = compileError(message);
  Object.assign(fromClient.err, {
    frame: "",
    loc: { line: 7, column: 33 },
  });
  const fromSsr = compileError(message);
  Object.assign(fromSsr.err, {
    id: "/fixture/src/app.vue",
    plugin: "unplugin-vue",
    frame: "5  |  \n6  |  emitTestEvent(\n7  |  const broken = ;",
    loc: { line: 7, column: 33 },
  });

  server.ws.send(fromClient);
  server.environments.ssr!.hot.send(fromSsr);

  expect(ssrSend.mock.calls).toEqual([
    ["vue-tui:hmr-error-context", { timestamp: 1785293748167 }],
    [fromClient],
  ]);
});

test("the same failure is paired when the SSR environment reports first", () => {
  const { server, ssrSend } = bridged(101);
  const fromSsr = compileError("[vue/compiler-sfc] Unexpected token (7:33)");
  const fromClient = compileError("[vue/compiler-sfc] Unexpected token (7:33)");

  server.environments.ssr!.hot.send(fromSsr);
  server.ws.send(fromClient);

  expect(ssrSend.mock.calls).toEqual([
    ["vue-tui:hmr-error-context", { timestamp: 101 }],
    [fromSsr],
  ]);
});

test("matching failures without a watcher timestamp fail open instead of being paired", () => {
  const { server, ssrSend } = bridged();
  const fromClient = compileError("Unexpected token");
  const fromSsr = compileError("Unexpected token");

  server.ws.send(fromClient);
  server.environments.ssr!.hot.send(fromSsr);

  expect(ssrSend.mock.calls).toEqual([[fromClient], [fromSsr]]);
});

test("two direct SSR errors are not collapsed merely because their messages match", () => {
  const { server, ssrSend } = bridged();

  server.environments.ssr!.hot.send(compileError("same message"));
  server.environments.ssr!.hot.send(compileError("same message"));

  expect(ssrSend.mock.calls).toHaveLength(2);
});

test("matching messages at different locations remain distinct across environments", () => {
  const { server, ssrSend } = bridged(101);
  const fromClient = compileError("Unexpected token");
  Object.assign(fromClient.err, {
    id: "/src/first.vue",
    frame: "1 | const broken = ;",
    loc: { file: "/src/first.vue", line: 1, column: 16 },
  });
  const fromSsr = compileError("Unexpected token");
  Object.assign(fromSsr.err, {
    id: "/src/second.vue",
    frame: "9 | const broken = ;",
    loc: { file: "/src/second.vue", line: 9, column: 16 },
  });

  server.ws.send(fromClient);
  server.environments.ssr!.hot.send(fromSsr);

  expect(ssrSend.mock.calls).toEqual([
    ["vue-tui:hmr-error-context", { timestamp: 101 }],
    [fromClient],
    ["vue-tui:hmr-error-context", { timestamp: 101 }],
    [fromSsr],
  ]);
});

test("matching diagnostics from different watcher timestamps are never paired", () => {
  const ssrSend = vi.fn();
  const server = {
    environments: { ssr: { hot: { send: ssrSend } } },
    ws: { send: vi.fn() },
  } as unknown as import("vite").ViteDevServer;
  let timestamp = 101;
  bridgeHmrEventsToRunner(server, { getUpdateTimestamp: () => timestamp });
  const fromClient = compileError("Unexpected token");
  fromClient.err.id = "/src/a.vue";
  const fromSsr = compileError("Unexpected token");

  server.ws.send(fromClient);
  timestamp = 202;
  server.environments.ssr!.hot.send(fromSsr);

  expect(ssrSend.mock.calls).toEqual([
    ["vue-tui:hmr-error-context", { timestamp: 101 }],
    [fromClient],
    ["vue-tui:hmr-error-context", { timestamp: 202 }],
    [fromSsr],
  ]);
});

test("multiple client errors can be paired after the SSR environment catches up", () => {
  const { server, ssrSend } = bridged(101);
  const clientFirst = compileError("Unexpected token");
  clientFirst.err.id = "/src/first.vue";
  const clientSecond = compileError("Unexpected token");
  clientSecond.err.id = "/src/second.vue";
  const ssrFirst = compileError("Unexpected token");
  ssrFirst.err.id = "/src/first.vue";
  const ssrSecond = compileError("Unexpected token");
  ssrSecond.err.id = "/src/second.vue";

  server.ws.send(clientFirst);
  server.ws.send(clientSecond);
  server.environments.ssr!.hot.send(ssrFirst);
  server.environments.ssr!.hot.send(ssrSecond);

  expect(ssrSend.mock.calls).toEqual([
    ["vue-tui:hmr-error-context", { timestamp: 101 }],
    [clientFirst],
    ["vue-tui:hmr-error-context", { timestamp: 101 }],
    [clientSecond],
  ]);
});

test("a different failure in the same watcher task is still delivered", () => {
  const { server, ssrSend } = bridged();

  server.environments.ssr!.hot.send(compileError("first"));
  server.environments.ssr!.hot.send(compileError("second"));

  expect(ssrSend.mock.calls.map(([payload]) => payload.err.message)).toEqual(["first", "second"]);
});

// The overlay is a state display: the memo holds only while the runner is still
// showing that error. An applied update or a full reload replaces it, so the same
// diagnostic on a later edit must reach the developer again.
test.for(["update", "full-reload"] as const)(
  "an intervening %s lets the same failure report again",
  (type) => {
    const { server, ssrSend } = bridged();

    server.environments.ssr!.hot.send(compileError("Unexpected token"));
    server.environments.ssr!.hot.send(
      type === "update"
        ? { type: "update", updates: [] }
        : { type: "full-reload", triggeredBy: "/src/app.vue" },
    );
    server.environments.ssr!.hot.send(compileError("Unexpected token"));

    expect(ssrSend.mock.calls.filter(([payload]) => payload.type === "error")).toHaveLength(2);
  },
);

test("does not throw when the ssr environment is absent", () => {
  const original = vi.fn();
  const server = {
    environments: {},
    ws: { send: original },
  } as unknown as import("vite").ViteDevServer;
  expect(() => bridgeHmrEventsToRunner(server)).not.toThrow();
});
