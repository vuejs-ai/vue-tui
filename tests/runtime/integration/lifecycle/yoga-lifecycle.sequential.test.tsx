// Sequential: spies on the process-shared Yoga module (Node and Config
// allocation/free counts). Concurrent siblings that mount hosts would perturb
// the counts. Tests are it.sequential.
//
// Direct regression evidence for Runtime-owned Yoga cleanup: production ships no
// global counters, so these tests observe the exact Node and Config allocation/
// free seams on the runtime's own yoga-layout instance and require every
// allocation to be freed by teardown.

import { createRequire } from "node:module";
import { defineComponent } from "vue";
import { afterEach, expect, test, vi } from "vite-plus/test";
import { Box, createApp, renderToString, Text } from "@vue-tui/runtime";
import { makeFakeStdin, makeFakeWritable } from "./test-streams.ts";

interface YogaLifecycleModule {
  default: {
    Config: {
      create(): { free(): void };
      prototype: { free(): void };
    };
    Node: {
      create(): unknown;
      // Only the members these tests spy on. `setWidth` is the first prototype
      // call the renderer makes after attachYoga() allocated the root node, so
      // failing it isolates "threw after Yoga attachment" from any earlier step.
      prototype: { free(): void; setWidth(width: number | "auto" | `${number}%`): void };
    };
  };
}

function resolveRuntimeYoga(): Promise<YogaLifecycleModule> {
  // Resolve the runtime's own Yoga dependency so the spies observe the exact
  // module instance the built renderer allocates from.
  const localRequire = createRequire(import.meta.url);
  const runtimeRequire = createRequire(localRequire.resolve("@vue-tui/runtime/package.json"));
  return import(runtimeRequire.resolve("yoga-layout")) as Promise<YogaLifecycleModule>;
}

async function spyOnYogaLifecycle(): Promise<{
  readonly balance: () => { readonly created: number; readonly freed: number };
  readonly configBalance: () => { readonly created: number; readonly freed: number };
}> {
  const yoga = await resolveRuntimeYoga();
  const createSpy = vi.spyOn(yoga.default.Node, "create");
  const freeSpy = vi.spyOn(yoga.default.Node.prototype, "free");
  const configCreateSpy = vi.spyOn(yoga.default.Config, "create");
  const configFreeSpy = vi.spyOn(yoga.default.Config.prototype, "free");
  const createdBefore = createSpy.mock.calls.length;
  const freedBefore = freeSpy.mock.calls.length;
  const configsCreatedBefore = configCreateSpy.mock.calls.length;
  const configsFreedBefore = configFreeSpy.mock.calls.length;
  return {
    balance: () => ({
      created: createSpy.mock.calls.length - createdBefore,
      freed: freeSpy.mock.calls.length - freedBefore,
    }),
    configBalance: () => ({
      created: configCreateSpy.mock.calls.length - configsCreatedBefore,
      freed: configFreeSpy.mock.calls.length - configsFreedBefore,
    }),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

const AllocatedLeaf = defineComponent(() => () => <Text>allocated</Text>);

test.sequential("repeated mount and unmount frees every Yoga allocation", async () => {
  const { balance, configBalance } = await spyOnYogaLifecycle();
  const App = defineComponent(() => () => (
    <Box>
      <Text>x</Text>
      <AllocatedLeaf />
    </Box>
  ));

  for (let cycle = 0; cycle < 25; cycle++) {
    const stdout = makeFakeWritable();
    const stderr = makeFakeWritable();
    const { stream: stdin } = makeFakeStdin();
    const app = createApp(App);
    app.mount({ stdout, stdin, stderr });
    app.unmount();
    await expect(app.waitUntilExit()).resolves.toBeUndefined();
  }

  const { created, freed } = balance();
  expect(created).toBeGreaterThan(0);
  expect(freed).toBe(created);
  const configs = configBalance();
  expect(configs.created).toBeGreaterThan(0);
  expect(configs.freed).toBe(configs.created);
});

test.sequential("a throw after Yoga attachment frees the allocation", async () => {
  // Fail the exact root-width call that runs after attachYoga() allocated the
  // root's yoga node; teardown must still free it.
  const yoga = await resolveRuntimeYoga();
  const { balance } = await spyOnYogaLifecycle();
  const widthError = new Error("YOGA_SET_WIDTH_FAILED");
  vi.spyOn(yoga.default.Node.prototype, "setWidth").mockImplementationOnce(() => {
    throw widthError;
  });
  const App = defineComponent(() => () => <Text>after-attach</Text>);

  const stdout = makeFakeWritable();
  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();
  const app = createApp(App);
  const exited = app.waitUntilExit();
  expect(() => app.mount({ stdout, stdin, stderr })).toThrow(widthError);
  await expect(exited).rejects.toBe(widthError);

  const { created, freed } = balance();
  expect(created).toBeGreaterThan(0);
  expect(freed).toBe(created);
});

test.sequential("an interrupted renderToString frees its Yoga allocations", async () => {
  const { balance } = await spyOnYogaLifecycle();
  const renderError = new Error("string render interrupted");
  const ThrowingLeaf = defineComponent(() => {
    throw renderError;
  });
  const Root = defineComponent(() => () => (
    <Box>
      <AllocatedLeaf />
      <ThrowingLeaf />
    </Box>
  ));

  expect(() => renderToString(Root)).toThrow(renderError);

  const { created, freed } = balance();
  expect(created).toBeGreaterThan(0);
  expect(freed).toBe(created);
});

test.sequential("a partial live mount failure frees Yoga allocations (stateful root)", async () => {
  const { balance } = await spyOnYogaLifecycle();
  const originalError = new Error("partial child setup");
  const ThrowingLeaf = defineComponent(() => {
    throw originalError;
  });
  const Root = defineComponent(() => () => (
    <Box>
      <AllocatedLeaf />
      <ThrowingLeaf />
    </Box>
  ));

  const stdout = makeFakeWritable();
  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();
  const app = createApp(Root);
  app.config.warnHandler = () => {};
  vi.spyOn(console, "error").mockImplementation(() => {});
  const exited = app.waitUntilExit();
  expect(() => app.mount({ stdout, stdin, stderr })).toThrow(originalError);
  await expect(exited).rejects.toBe(originalError);

  const { created, freed } = balance();
  expect(created).toBeGreaterThan(0);
  expect(freed).toBe(created);
});

test.sequential("a partial live mount failure frees Yoga allocations (functional root)", async () => {
  const { balance } = await spyOnYogaLifecycle();
  const originalError = new Error("functional partial child setup");
  const ThrowingLeaf = defineComponent(() => {
    throw originalError;
  });
  const FunctionalRoot = () => (
    <Box>
      <AllocatedLeaf />
      <ThrowingLeaf />
    </Box>
  );

  const stdout = makeFakeWritable();
  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();
  const app = createApp(FunctionalRoot);
  app.config.warnHandler = () => {};
  vi.spyOn(console, "error").mockImplementation(() => {});
  const exited = app.waitUntilExit();
  expect(() => app.mount({ stdout, stdin, stderr })).toThrow(originalError);
  await expect(exited).rejects.toBe(originalError);

  const { created, freed } = balance();
  expect(created).toBeGreaterThan(0);
  expect(freed).toBe(created);
});

test.sequential("a stateful root setup throw frees the root Yoga allocation", async () => {
  // The root's own setup throws before its subtree exists, so no renderer-owned
  // vnode can drive a Vue unmount; the render-owned allocation ledger and root
  // detach must still free every Yoga node.
  const { balance } = await spyOnYogaLifecycle();
  const setupError = new Error("root setup failure");
  const ThrowingRoot = defineComponent(() => {
    throw setupError;
  });

  const stdout = makeFakeWritable();
  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();
  const app = createApp(ThrowingRoot);
  app.config.warnHandler = () => {};
  vi.spyOn(console, "error").mockImplementation(() => {});
  const exited = app.waitUntilExit();
  expect(() => app.mount({ stdout, stdin, stderr })).toThrow(setupError);
  await expect(exited).rejects.toBe(setupError);

  const { created, freed } = balance();
  expect(created).toBeGreaterThan(0);
  expect(freed).toBe(created);
});
