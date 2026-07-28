import { afterEach, expect, test } from "vite-plus/test";
import type { TuiApp } from "@vue-tui/runtime";
import { setTestEventSink } from "@vue-tui/runtime/internal/testing";
import type { ComponentOptions, ComponentPublicInstance } from "vue";
import { reportFixtureLifecycle } from "./fixture-lifecycle.ts";

interface LifecycleHooks {
  mounted(this: ComponentPublicInstance): void;
  unmounted(this: ComponentPublicInstance): void;
}

interface DeferredExit {
  readonly promise: Promise<void>;
  resolve(): void;
  reject(error: Error): void;
}

function deferredExit(): DeferredExit {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

function fakeApp(exit: DeferredExit): {
  readonly app: TuiApp;
  hooks(): LifecycleHooks;
} {
  let lifecycleHooks: LifecycleHooks | undefined;
  const app = {
    mixin(mixin: ComponentOptions) {
      lifecycleHooks = mixin as LifecycleHooks;
      return app;
    },
    waitUntilExit() {
      return exit.promise;
    },
  };
  return {
    app: app as unknown as TuiApp,
    hooks() {
      if (lifecycleHooks === undefined) {
        throw new Error("fixture lifecycle mixin was not installed");
      }
      return lifecycleHooks;
    },
  };
}

function instance(parent: ComponentPublicInstance | null): ComponentPublicInstance {
  return { $parent: parent } as ComponentPublicInstance;
}

afterEach(() => {
  setTestEventSink(() => {});
});

test("reports only the stable Vue root lifecycle before a clean final exit", async () => {
  const events: Array<{ ev: string; data?: unknown }> = [];
  setTestEventSink((line) => events.push(JSON.parse(line)));
  const exit = deferredExit();
  const fixture = fakeApp(exit);

  reportFixtureLifecycle(fixture.app);
  const hooks = fixture.hooks();
  const root = instance(null);
  const child = instance(root);
  hooks.mounted.call(child);
  hooks.mounted.call(root);
  hooks.unmounted.call(child);
  hooks.unmounted.call(root);
  exit.resolve();
  await exit.promise;
  await Promise.resolve();

  expect(events).toEqual([
    expect.objectContaining({ ev: "app:mounted" }),
    expect.objectContaining({ ev: "app:unmounted" }),
    expect.objectContaining({ ev: "app:exit", data: { code: 0 } }),
  ]);
});

test("reports a failed app exit without manufacturing an unmount", async () => {
  const events: Array<{ ev: string; data?: unknown }> = [];
  setTestEventSink((line) => events.push(JSON.parse(line)));
  const exit = deferredExit();
  const fixture = fakeApp(exit);

  reportFixtureLifecycle(fixture.app);
  exit.reject(new Error("mount failed"));
  await expect(exit.promise).rejects.toThrow("mount failed");
  await Promise.resolve();

  expect(events).toEqual([expect.objectContaining({ ev: "app:exit", data: { code: 1 } })]);
});
