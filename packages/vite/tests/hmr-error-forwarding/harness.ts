import { onTestFinished, vi } from "vite-plus/test";
import type {
  EnvironmentOptions,
  Plugin,
  ResolvedConfig,
  RunnableDevEnvironment,
  ServerModuleRunnerOptions,
} from "vite";
import type {
  EvaluatedModuleNode,
  HMRLogger,
  ModuleEvaluator,
  ModuleRunnerContext,
} from "vite/module-runner";
import { ESModulesEvaluator, ModuleRunner } from "vite/module-runner";
import {
  hmrErrorForwardingPlugin,
  type HmrErrorForwardingDependencies,
} from "../../src/hmr-error-forwarding.ts";

type ConfigEnvironmentHandler = (
  name: string,
  options: EnvironmentOptions,
) => EnvironmentOptions | void;
type ConfigResolvedHandler = (config: ResolvedConfig) => void;

export function configEnvironmentHook(plugin: Plugin): ConfigEnvironmentHandler {
  return plugin.configEnvironment as ConfigEnvironmentHandler;
}

export function configResolvedHook(plugin: Plugin): ConfigResolvedHandler {
  const hook = plugin.configResolved;
  if (typeof hook === "function") return hook as ConfigResolvedHandler;
  if (hook !== undefined && "handler" in hook) {
    return hook.handler as ConfigResolvedHandler;
  }
  throw new Error(`${plugin.name} has no configResolved hook`);
}

type HotModules = Map<string, { id: string; callbacks: { deps: string[]; fn: HotCallback }[] }>;
type HotCallback = (modules: unknown[]) => void;
/**
 * Written as a standalone shape rather than an intersection with Vite's
 * `HMRClient`: several of these members are declared `private` there, and an
 * intersection that redeclares one reduces to `never`.
 */
interface RealHmrClient {
  fetchUpdate?: unknown;
  logger: HMRLogger;
  hotModulesMap: HotModules;
  disposeMap: Map<string, (data: unknown) => void | Promise<void>>;
  importUpdatedModule: (update: { acceptedPath: string }) => Promise<unknown>;
  queueUpdate: (payload: unknown) => Promise<void>;
}

/**
 * A REAL Vite HMRClient, driven through its public maps.
 *
 * Not a stub, and the difference decides the outcome: HMRClient batches, so the
 * first `queueUpdate` in a microtask runs every queued update's accept callback
 * inside itself. A stub that resolved each payload independently made the old
 * per-batch scope look per-update and could never have caught its defect.
 *
 * Only `importUpdatedModule` is replaced — it is what a runner would otherwise do
 * over a transport — so each update's fetch can be made to succeed or fail on
 * demand while every batching, dispose and callback path stays Vite's own.
 */
function createRealHmrClient(): { client: RealHmrClient; close: () => Promise<void> } {
  const runner = new ModuleRunner(
    {
      transport: { connect() {}, send() {} },
      hmr: { logger: { debug() {}, error() {} } },
    },
    new ESModulesEvaluator(),
  );
  const client = runner.hmrClient as unknown as RealHmrClient | undefined;
  if (client === undefined) throw new Error("Expected the module runner to create an HMR client");
  return { client, close: () => runner.close() };
}

export function createObserverHarness(harnessOptions: { withoutFetchUpdate?: boolean } = {}) {
  const send = vi.fn();
  const logError = vi.fn();
  const logInfo = vi.fn();
  const { client: hmrClient, close } = createRealHmrClient();
  onTestFinished(close);
  if (harnessOptions.withoutFetchUpdate === true) {
    hmrClient.fetchUpdate = undefined;
  }
  const importUpdatedModule = vi.fn(
    async (_update: { acceptedPath: string }): Promise<unknown> => ({
      default: {},
    }),
  );
  hmrClient.importUpdatedModule = (update) => importUpdatedModule(update);
  const environment = {
    hot: { send },
    logger: { error: logError, info: logInfo },
    runner: { hmrClient },
  } as unknown as RunnableDevEnvironment;
  const runInlinedModule = vi.fn(async () => ({ delegated: "inline" }));
  const runExternalModule = vi.fn(async () => ({ delegated: "external" }));
  const baseEvaluator: ModuleEvaluator = {
    startOffset: 17,
    runInlinedModule,
    runExternalModule,
  };
  let runnerOptions: ServerModuleRunnerOptions | undefined;
  const createRunnableDevEnvironment = vi.fn(
    (
      _name: string,
      _config: ResolvedConfig,
      context?: { runnerOptions?: ServerModuleRunnerOptions },
    ) => {
      runnerOptions = context?.runnerOptions;
      return environment;
    },
  );
  const dependencies: HmrErrorForwardingDependencies = {
    createRunnableDevEnvironment:
      createRunnableDevEnvironment as HmrErrorForwardingDependencies["createRunnableDevEnvironment"],
    createEvaluator: () => baseEvaluator,
  };
  const plugin = hmrErrorForwardingPlugin({ dependencies });
  const resolved = configEnvironmentHook(plugin)("ssr", {
    dev: {},
  } as EnvironmentOptions);
  const factory = resolved?.dev?.createEnvironment;
  if (factory === undefined)
    throw new Error("Expected the SSR environment factory to be installed");
  const created = factory("ssr", {} as ResolvedConfig, {} as never);
  if (created instanceof Promise) throw new Error("Expected a synchronous environment factory");
  const options = runnerOptions;
  if (options === undefined) throw new Error("Expected runner options");
  const logger = options.hmr === false ? undefined : options.hmr?.logger;
  if (logger === undefined || logger === false) {
    throw new Error("Expected an HMR logger");
  }
  if (options.evaluator === undefined) throw new Error("Expected an evaluator");

  // In production the runner is created WITH this logger; here the client had to
  // exist before the factory could be handed an environment, so it is installed
  // now. `warnFailedUpdate` reports a failed import through it, which is the path
  // that decides whether a later accept throw counts as a cause or a consequence.
  hmrClient.logger = logger;
  return {
    baseEvaluator,
    createRunnableDevEnvironment,
    created,
    evaluator: options.evaluator,
    logger,
    logError,
    logInfo,
    runExternalModule,
    runInlinedModule,
    send,
    close,
    /** What this update's import resolves to, or throws. */
    importUpdatedModule,
    /** Register an accepting module, the way `import.meta.hot.accept` does. */
    accept(path: string, fn: HotCallback, deps: string[] = [path]): void {
      hmrClient.hotModulesMap.set(path, { id: path, callbacks: [{ deps, fn }] });
    },
    /** Register a dispose handler — the one thing awaited outside fetchUpdate's try. */
    onDispose(path: string, fn: () => void | Promise<void>): void {
      hmrClient.disposeMap.set(path, fn);
    },
    /** The patched entry point — what Vite calls, and what the guard wraps. */
    applyUpdate: (path: string, acceptedPath = path): Promise<void> =>
      hmrClient.queueUpdate({ type: "js-update", path, acceptedPath, timestamp: 1 }),
  };
}

export const context = {} as ModuleRunnerContext;
export const evaluatedModule = { url: "/src/app.tsx" } as EvaluatedModuleNode;
