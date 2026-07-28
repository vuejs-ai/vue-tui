import { expect, test, vi } from "vite-plus/test";
import type { EnvironmentOptions, ResolvedConfig } from "vite";
import {
  hmrErrorForwardingPlugin,
  type HmrErrorForwardingDependencies,
  VueTuiSsrEnvironmentFactoryConflictError,
} from "../../src/hmr-error-forwarding.ts";
import {
  configEnvironmentHook,
  configResolvedHook,
  context,
  createObserverHarness,
  evaluatedModule,
} from "./harness.ts";

test("the runner observers normalize evaluator failures and ignore logger strings", async () => {
  const harness = createObserverHarness();
  const compileError = Object.assign(new Error("compile failed"), {
    id: "/src/app.tsx",
    frame: "bad syntax",
  });

  harness.logger.error("diagnostic text");
  harness.logger.error(compileError);

  expect(harness.send).toHaveBeenCalledTimes(1);
  expect(harness.send).toHaveBeenLastCalledWith({
    type: "error",
    err: expect.objectContaining({
      name: "Error",
      message: "compile failed",
      stack: expect.any(String),
      id: "/src/app.tsx",
      frame: "bad syntax",
      phase: "compile",
    }),
  });
  expect(harness.send.mock.calls[0]![0].err).not.toBe(compileError);
  expect(harness.logError).toHaveBeenCalledWith("diagnostic text", { timestamp: true });
  expect(harness.logError).toHaveBeenCalledWith("compile failed", { timestamp: true });

  const evaluateError = new Error("evaluate failed");
  harness.runInlinedModule.mockRejectedValueOnce(evaluateError);
  await expect(
    harness.evaluator.runInlinedModule(context, "throw new Error()", evaluatedModule),
  ).rejects.toBe(evaluateError);

  expect(harness.send).toHaveBeenCalledTimes(2);
  expect(harness.send).toHaveBeenLastCalledWith({
    type: "error",
    err: expect.objectContaining({
      message: "evaluate failed",
      phase: "evaluate",
    }),
  });

  harness.runInlinedModule.mockRejectedValueOnce("non-Error rejection");
  await expect(
    harness.evaluator.runInlinedModule(context, "throw 'no'", evaluatedModule),
  ).rejects.toBe("non-Error rejection");
  expect(harness.send).toHaveBeenCalledTimes(3);
  expect(harness.send).toHaveBeenLastCalledWith({
    type: "error",
    err: expect.objectContaining({
      message: "non-Error rejection",
      phase: "evaluate",
    }),
  });
});

test("deduplicates one propagation chain but permits the same Error on a later tick", async () => {
  const harness = createObserverHarness();
  const singleton = new Error("shared singleton");
  harness.runInlinedModule.mockRejectedValueOnce(singleton);

  await expect(
    harness.evaluator.runInlinedModule(context, "throw singleton", evaluatedModule),
  ).rejects.toBe(singleton);
  harness.logger.error(singleton);
  expect(harness.send).toHaveBeenCalledTimes(1);

  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  harness.logger.error(singleton);

  expect(harness.send).toHaveBeenCalledTimes(2);
  expect(harness.send).toHaveBeenLastCalledWith({
    type: "error",
    err: expect.objectContaining({
      message: "shared singleton",
      phase: "compile",
    }),
  });
});

test("forwarding failure never replaces the evaluator's original error", async () => {
  const harness = createObserverHarness();
  const original = new Error("original evaluation failure");
  const forwarding = new Error("transport failed");
  harness.runInlinedModule.mockRejectedValueOnce(original);
  harness.send.mockImplementationOnce(() => {
    throw forwarding;
  });
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

  try {
    await expect(
      harness.evaluator.runInlinedModule(context, "throw original", evaluatedModule),
    ).rejects.toBe(original);
    expect(harness.send).toHaveBeenCalledOnce();
  } finally {
    consoleError.mockRestore();
  }
});

test("the observer delegates evaluator metadata, successful inline work, and external modules", async () => {
  const harness = createObserverHarness();
  const inlineResult = await harness.evaluator.runInlinedModule(
    context,
    "export const answer = 42",
    evaluatedModule,
  );
  const externalResult = await harness.evaluator.runExternalModule("file:///external.mjs");

  expect(harness.created).toBeDefined();
  expect(harness.createRunnableDevEnvironment).toHaveBeenCalledOnce();
  expect(harness.evaluator.startOffset).toBe(harness.baseEvaluator.startOffset);
  expect(harness.runInlinedModule).toHaveBeenCalledWith(
    context,
    "export const answer = 42",
    evaluatedModule,
  );
  expect(inlineResult).toEqual({ delegated: "inline" });
  expect(harness.runExternalModule).toHaveBeenCalledWith("file:///external.mjs");
  expect(externalResult).toEqual({ delegated: "external" });
  expect(harness.send).not.toHaveBeenCalled();
});

test("the observer rejects an existing SSR factory with a named conflict", () => {
  const plugin = hmrErrorForwardingPlugin();
  const existingFactory = vi.fn();

  expect(() =>
    configEnvironmentHook(plugin)("ssr", {
      dev: { createEnvironment: existingFactory },
    } as unknown as EnvironmentOptions),
  ).toThrowError(VueTuiSsrEnvironmentFactoryConflictError);

  try {
    configEnvironmentHook(plugin)("ssr", {
      dev: { createEnvironment: existingFactory },
    } as unknown as EnvironmentOptions);
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).name).toBe("VueTuiSsrEnvironmentFactoryConflictError");
  }
  expect(existingFactory).not.toHaveBeenCalled();
});

test("the observer rejects a factory that a later plugin installs over its own", () => {
  const plugin = hmrErrorForwardingPlugin();
  const resolved = configEnvironmentHook(plugin)("ssr", {
    dev: {},
  } as EnvironmentOptions);
  const installedFactory = resolved?.dev?.createEnvironment;
  if (installedFactory === undefined) throw new Error("Expected an installed factory");
  const resolve = configResolvedHook(plugin);

  expect(() =>
    resolve({
      environments: {
        ssr: { dev: { createEnvironment: installedFactory } },
      },
    } as unknown as ResolvedConfig),
  ).not.toThrow();
  expect(() =>
    resolve({
      environments: {
        ssr: { dev: { createEnvironment: vi.fn() } },
      },
    } as unknown as ResolvedConfig),
  ).toThrowError(
    expect.objectContaining({
      name: "VueTuiSsrEnvironmentFactoryConflictError",
      message: expect.stringMatching(/was replaced after vueTui/),
    }),
  );
});

test("the observer does not participate in non-SSR environment configuration", () => {
  const createRunnableDevEnvironment = vi.fn();
  const createEvaluator = vi.fn();
  const dependencies = {
    createRunnableDevEnvironment,
    createEvaluator,
  } as unknown as HmrErrorForwardingDependencies;
  const plugin = hmrErrorForwardingPlugin({ dependencies });

  expect(
    configEnvironmentHook(plugin)("client", { dev: {} } as EnvironmentOptions),
  ).toBeUndefined();
  expect(createRunnableDevEnvironment).not.toHaveBeenCalled();
  expect(createEvaluator).not.toHaveBeenCalled();
});
