import { expect, test, vi } from "vite-plus/test";
import type { DevEnvironment, EnvironmentModuleNode, Plugin } from "vite";
import { hmrErrorForwardingPlugin } from "../../src/hmr-error-forwarding.ts";
import type { WatcherUpdateTracker } from "../../src/watcher-update.ts";

type PreflightContext = {
  environment: Pick<DevEnvironment, "name" | "transformRequest">;
};
type PreflightOptions = {
  file: string;
  modules: EnvironmentModuleNode[];
  type?: "update";
  timestamp?: number;
};
type PreflightHandler = (this: PreflightContext, options: PreflightOptions) => void | Promise<void>;

function preflightHook(plugin: Plugin): {
  order: string;
  handler: PreflightHandler;
} {
  return plugin.hotUpdate as unknown as {
    order: string;
    handler: PreflightHandler;
  };
}

function preflightContext(name: string, transformRequest = vi.fn()): PreflightContext {
  return {
    environment: {
      name,
      transformRequest,
    } as unknown as Pick<DevEnvironment, "name" | "transformRequest">,
  };
}

function moduleNode(url: string): EnvironmentModuleNode {
  return { url } as EnvironmentModuleNode;
}

test("preflights every changed SSR source module in the forwarding plugin's post hook", async () => {
  const plugin = hmrErrorForwardingPlugin();
  const hook = preflightHook(plugin);

  expect(plugin.name).toBe("vue-tui:hmr-error-forwarding");
  expect(plugin.configEnvironment).toBeDefined();
  expect(hook.order).toBe("post");

  for (const extension of [".js", ".jsx", ".mjs", ".mts", ".cjs", ".cts", ".ts", ".tsx", ".vue"]) {
    const transformRequest = vi.fn(async () => undefined);
    const context = preflightContext("ssr", transformRequest);
    const modules = [moduleNode(`/src/first${extension}`), moduleNode(`/src/second${extension}`)];

    await hook.handler.call(context, {
      file: `/src/changed${extension}`,
      modules,
    });

    expect(transformRequest.mock.calls).toEqual([
      [`/src/first${extension}`],
      [`/src/second${extension}`],
    ]);
  }
});

test("preflight covers modules the runner evaluates and skips the rest", async () => {
  const handler = preflightHook(hmrErrorForwardingPlugin()).handler;
  const nonSsrTransform = vi.fn();
  const ssrTransform = vi.fn(async () => undefined);

  await handler.call(preflightContext("client", nonSsrTransform), {
    file: "/src/app.vue",
    modules: [moduleNode("/src/app.vue")],
  });
  expect(nonSsrTransform).not.toHaveBeenCalled();

  // An external `<template src="./x.html">` edit arrives as a `.html` change and
  // its modules are the compiled sub-request plus the raw file. The sub-request
  // is JavaScript however it is named — skipping it left the failure unreported —
  // and the raw file is not, so asking Vite to transform it as JS fails import
  // analysis and reports that instead of the developer's error.
  await handler.call(preflightContext("ssr", ssrTransform), {
    file: "/src/app-template.html",
    modules: [
      moduleNode("/src/app-template.html?vue&type=template&src=true&lang.js"),
      moduleNode("/src/app-template.html"),
    ],
  });
  expect(ssrTransform.mock.calls).toEqual([
    ["/src/app-template.html?vue&type=template&src=true&lang.js"],
  ]);
});

test("a pre-classified duplicate is removed before SSR preflight and runner delivery", async () => {
  const watcherUpdates: WatcherUpdateTracker = {
    observe: vi.fn(() => false),
    isDuplicate: (timestamp) => timestamp === 202,
  };
  const hook = preflightHook(hmrErrorForwardingPlugin({ watcherUpdates }));
  const transformRequest = vi.fn(async () => undefined);
  const ssr = preflightContext("ssr", transformRequest);
  const update = (timestamp: number): PreflightOptions => ({
    type: "update",
    file: "/src/app.tsx",
    modules: [moduleNode("/src/app.tsx")],
    timestamp,
  });

  await expect(hook.handler.call(ssr, update(101))).resolves.toBeUndefined();
  await expect(hook.handler.call(ssr, update(202))).resolves.toEqual([]);
  expect(transformRequest).toHaveBeenCalledTimes(1);
});

test("preflight stops at the first failed module and preserves the original rejection", async () => {
  const plugin = hmrErrorForwardingPlugin();
  const original = new Error("compiler failed");
  const transformRequest = vi
    .fn()
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(original)
    .mockResolvedValueOnce(undefined);
  const context = preflightContext("ssr", transformRequest);

  await expect(
    preflightHook(plugin).handler.call(context, {
      file: "/src/app.tsx",
      modules: [
        moduleNode("/src/one.tsx"),
        moduleNode("/src/two.tsx"),
        moduleNode("/src/three.tsx"),
      ],
    }),
  ).rejects.toBe(original);
  expect(transformRequest.mock.calls).toEqual([["/src/one.tsx"], ["/src/two.tsx"]]);
});
