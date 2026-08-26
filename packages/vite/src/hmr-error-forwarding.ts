import { AsyncLocalStorage } from "node:async_hooks";
import {
  createRunnableDevEnvironment,
  type EnvironmentOptions,
  type ErrorPayload,
  type Plugin,
  type RunnableDevEnvironment,
} from "vite";
import { ESModulesEvaluator, type HMRLogger, type ModuleEvaluator } from "vite/module-runner";
import { invalidateDevHmrUpdate } from "@vue-tui/runtime/internal/devtools";
import { stripModuleIdQuery } from "./entry-match.ts";
import { createWatcherUpdateTracker, type WatcherUpdateTracker } from "./watcher-update.ts";

const SOURCE_MODULE_RE = /\.(?:[cm]?[jt]sx?|vue)$/;

/**
 * Whether the SSR runner will evaluate this module as JavaScript.
 *
 * A query marks a compiler sub-request — `/src/app-template.html?vue&type=
 * template&src=true&lang.js` is what an external `<template src>` becomes — and
 * those are JavaScript by construction however the file is named. Without the
 * query the extension is the only signal, and a bare `.html` in the same update
 * is the raw file, which fails import analysis if asked to be JS.
 */
function willBeEvaluatedAsJs(url: string): boolean {
  const bare = stripModuleIdQuery(url);
  return bare !== url || SOURCE_MODULE_RE.test(bare);
}

type ErrorPhase = "compile" | "evaluate";
interface UpdateScope {
  readonly boundaryPath: string;
  readonly acceptedPath: string;
  reported: number;
}
type SsrEnvironmentFactory = NonNullable<
  NonNullable<EnvironmentOptions["dev"]>["createEnvironment"]
>;

type HmrClient = NonNullable<RunnableDevEnvironment["runner"]["hmrClient"]>;
type HmrUpdate = Parameters<HmrClient["queueUpdate"]>[0];
/** What one update's `fetchUpdate` hands back for the batch to invoke. */
type AcceptCallback = () => unknown;
type HotCallback = (modules: unknown[]) => unknown;
interface HotCallbackRegistration {
  readonly deps: string[];
  fn: HotCallback;
}
interface HotModuleRegistration {
  callbacks: HotCallbackRegistration[];
}

/**
 * `fetchUpdate` is `private` in Vite's declaration but is an ordinary prototype
 * method, and it is the only per-update seam there is — see the comment on the
 * guard below for why `queueUpdate` cannot serve.
 *
 * Reached through `unknown` rather than by intersecting with `HMRClient`, because
 * a private member of the same name reduces that intersection to `never`.
 * `packages/vite/tests/hmr-error-forwarding/client-updates.test.ts` drives the
 * guard through a real `ModuleRunner`, so a Vite change fails the implementation
 * tests rather than a developer's terminal.
 */
interface HmrClientInternals {
  fetchUpdate?: (update: HmrUpdate) => Promise<AcceptCallback | undefined>;
  hotModulesMap?: Map<string, HotModuleRegistration>;
}

export interface HmrErrorForwardingDependencies {
  createRunnableDevEnvironment: typeof createRunnableDevEnvironment;
  createEvaluator(): ModuleEvaluator;
}

interface HmrErrorForwardingOptions {
  readonly dependencies?: HmrErrorForwardingDependencies;
  readonly watcherUpdates?: WatcherUpdateTracker;
}

const defaultDependencies: HmrErrorForwardingDependencies = {
  createRunnableDevEnvironment,
  createEvaluator: () => new ESModulesEvaluator(),
};

const REPLACED_REASON = "was replaced after vueTui() installed its factory";

/**
 * Present a thrown value as something the overlay can show. `throw "boom"` and
 * `throw { code: 1 }` are legal and reach the same place a thrown Error does, so
 * the reporting path cannot assume it was given one.
 */
function asReportableError(value: unknown): Error {
  if (value instanceof Error) return value;
  if (typeof value === "string") return value.length > 0 ? new Error(value) : new Error('Threw ""');
  // Must not throw: this runs on the path that keeps the dev server alive, and a
  // circular object or a hostile toString would otherwise take the process down
  // by the very route the caller is trying to close.
  try {
    return new Error(JSON.stringify(value) ?? String(value));
  } catch {
    return new Error(`Threw a non-serializable ${typeof value}`);
  }
}

export class VueTuiSsrEnvironmentFactoryConflictError extends Error {
  override readonly name = "VueTuiSsrEnvironmentFactoryConflictError";

  constructor(reason = "is already configured") {
    super(
      `[vue-tui] environments.ssr.dev.createEnvironment ${reason}. ` +
        "vueTui() needs this factory to observe runner HMR failures and will not replace another owner.",
    );
  }
}

export class VueTuiViteHmrCompatibilityError extends Error {
  override readonly name = "VueTuiViteHmrCompatibilityError";

  constructor() {
    super(
      "[vue-tui] Vite 8.2.1 HMR compatibility check failed: runner.hmrClient.fetchUpdate and hotModulesMap are required. Install the exact supported Vite version instead of continuing with a partial HMR guard.",
    );
  }
}

export function hmrErrorForwardingPlugin({
  dependencies = defaultDependencies,
  watcherUpdates = createWatcherUpdateTracker(),
}: HmrErrorForwardingOptions = {}): Plugin {
  let installedFactory: SsrEnvironmentFactory | undefined;
  const createdEnvironments = new WeakSet<object>();
  // Set by the environment factory below. The hot-update preflight and the
  // runner observer are two stages of one mechanism; the preflight is the only
  // place that holds a compile failure before Vite decides whether to mention it.
  let reportCompileFailure: ((error: unknown) => void) | undefined;

  return {
    name: "vue-tui:hmr-error-forwarding",
    apply: "serve",

    // Load-bearing for two separate reasons, and the second one is easy to
    // reason your way out of.
    //
    // 1. An entry-level compile error. Rejecting the update before Vite applies
    //    it is what keeps a full reload from carrying the previous error
    //    across. `tests/vite/e2e/reload-carries-nothing-across.test.ts` goes red
    //    without this loop.
    //
    // 2. Keeping the failure to ONE report. Transforming here means the compile
    //    error is caught and forwarded from a single place, and the rejected
    //    update leaves little downstream to re-report. Skip it — even only for
    //    self-accepting modules, where the transform result really is discarded
    //    by the `updateModules` that follows — and the runner logger and the
    //    delegated evaluator report independently: one SFC syntax error became
    //    four `hmr:error` events on the developer's screen. Measured by doing
    //    exactly that.
    //
    //    This loop removes the duplicates it can reach. The one it cannot is
    //    Vite's own: an SFC syntax error is reported once for the client
    //    environment and once for the SSR environment, and no code here sees
    //    both. That pair is collapsed where they meet instead — `bridge-hmr.ts`.
    //
    // "Reports at least once" and "reports once" are different properties, and
    // only the second is what a developer experiences. The ~2-8ms of duplicate
    // transform per hot update buys the second.
    hotUpdate: {
      order: "post",
      async handler(options) {
        // The pre hook classifies watcher tasks before a compiler can emit or
        // throw. Emptying the duplicate's modules here also prevents runner
        // imports and full reloads after compiler hooks have completed.
        if (options.type === "update" && watcherUpdates.isDuplicate(options.timestamp)) return [];
        if (this.environment.name !== "ssr") return;
        // Filtered by the MODULE, not by the changed file. Gating on the
        // changed file's extension got a supported authoring form wrong: an
        // external `<template src="./x.html">` edit arrives as a `.html`
        // change, was skipped entirely, and its compile failure went
        // unreported. Gating on nothing at all is wrong in the other
        // direction — the `.html` is itself in `options.modules`, and asking
        // Vite to transform it as JavaScript fails import analysis and reports
        // that instead of the developer's error. What must be preflighted is
        // the module the runner will evaluate.
        for (const module of options.modules) {
          if (!willBeEvaluatedAsJs(module.url)) continue;
          try {
            await this.environment.transformRequest(module.url);
          } catch (error) {
            // Report from here rather than letting the rejection travel and
            // trusting Vite to log it. `warnFailedUpdate` drops any Error whose
            // message contains "fetch", assuming it came from its own module
            // fetch — so a developer's error that happens to say "fetch"
            // vanished, and the overlay showed a downstream TypeError instead.
            reportCompileFailure?.(error);
            // Still rethrown: rejecting the update before Vite applies it is
            // what keeps a full reload from carrying the previous error across.
            throw error;
          }
        }
      },
    },
    configEnvironment(name, options) {
      if (name !== "ssr") return;
      if (options.dev?.createEnvironment !== undefined) {
        throw new VueTuiSsrEnvironmentFactoryConflictError();
      }

      installedFactory = (environmentName, config) => {
        let environment: RunnableDevEnvironment;
        // Keyed by what the developer would SEE, not by object identity. One
        // compile failure reaches this code through more than one path — the
        // preflight, the runner's logger, the delegated evaluator, the
        // queueUpdate catch — and each arrives holding a different Error
        // instance describing the same thing.
        //
        // Entries are dropped on the next tick, so a failure that genuinely
        // recurs still reports. Note what this can and cannot do: it collapses
        // reports that pass through THIS code, and Vite sends its own error
        // payload for a failed transform directly, which nothing here can dedup.
        // That is why the preflight reports only the case Vite drops.
        const forwarded = new Set<string>();
        // Counts reports for ONE update, so a later failure in that update can
        // tell whether it is the first cause or a consequence of one already on
        // screen. Carried on the async chain because the sites that report — the
        // runner's logger, the delegated evaluator — are several frames below
        // the call that opened the update.
        const updateScope = new AsyncLocalStorage<UpdateScope>();

        const forward = (error: Error, phase: ErrorPhase): void => {
          // One propagation chain can carry distinct Error objects and can gain
          // or lose `error.id`, so the active update is the stable identity.
          // Vite distinguishes the accepting boundary (`path`) from the changed
          // dependency (`acceptedPath`); both are required because one boundary
          // can accept two dependencies that fail with the same message.
          const scope = updateScope.getStore();
          const errorId = (error as Error & { id?: unknown }).id;
          const key = JSON.stringify([
            scope?.boundaryPath,
            scope?.acceptedPath ?? (typeof errorId === "string" ? errorId : undefined),
            error.name,
            error.message,
          ]);
          // A duplicate is still a report of this scope's root cause. Mark it
          // before deduplication so a compiler callback's derived TypeError is
          // not mistaken for the first failure in this update.
          if (scope !== undefined) scope.reported += 1;
          if (forwarded.has(key)) return;
          forwarded.add(key);
          invalidateDevHmrUpdate();
          const cleanup = setTimeout(() => forwarded.delete(key), 0);
          cleanup.unref();
          environment.hot.send({
            type: "error",
            err: serializeError(error, phase),
          });
        };
        const tryForward = (error: Error, phase: ErrorPhase): void => {
          try {
            forward(error, phase);
          } catch {
            // The runner must continue propagating the developer's original
            // failure even when its diagnostic transport is unavailable.
          }
        };

        const logger: HMRLogger = {
          debug: (...messages) => {
            environment.logger.info(messages.join(" "), { timestamp: true });
          },
          error: (value) => {
            environment.logger.error(value instanceof Error ? value.message : String(value), {
              timestamp: true,
            });
            if (value instanceof Error) tryForward(value, "compile");
          },
        };

        const baseEvaluator = dependencies.createEvaluator();
        const evaluator: ModuleEvaluator = {
          startOffset: baseEvaluator.startOffset,
          runExternalModule: (file) => baseEvaluator.runExternalModule(file),
          async runInlinedModule(context, code, module) {
            try {
              return await baseEvaluator.runInlinedModule(context, code, module);
            } catch (error) {
              tryForward(asReportableError(error), "evaluate");
              throw error;
            }
          },
        };

        // Narrow on purpose, and the narrowness is the whole design.
        //
        // Vite sends its OWN error payload for a failed transform, so in the
        // ordinary case the overlay already shows the developer's error and a
        // second report from here just doubles it — measured: one syntax error
        // produced two `hmr:error` events, and no dedup of ours can suppress a
        // payload Vite sends directly.
        //
        // The exception is the reason this exists: `warnFailedUpdate` drops any
        // Error whose message contains "fetch", assuming it came from its own
        // module fetch. Then nothing reports at all — not the overlay, not the
        // raw stream — and the developer sees only a downstream TypeError. So
        // report exactly that case and stay out of the way otherwise.
        reportCompileFailure = (error) => {
          if (error instanceof Error && error.message.includes("fetch")) {
            tryForward(error, "compile");
          }
        };

        environment = dependencies.createRunnableDevEnvironment(environmentName, config, {
          runnerOptions: {
            hmr: { logger },
            evaluator,
          },
        });
        createdEnvironments.add(environment);

        // Vite invokes accept callbacks inside a try/finally with no catch (the
        // closure `fetchUpdate` returns), so a throw from ANY of them — the
        // shapes a compiler generates, and the ones an application writes by
        // hand — escapes as an unhandled rejection and Node ends the dev
        // process. This is the one compiler-independent choke point, so guard
        // the mechanism here instead of pattern-matching generated source text.
        //
        // Guarded at `fetchUpdate`, NOT at `queueUpdate`, because queueUpdate is
        // a BATCH and not an update. It pushes `fetchUpdate(payload)` onto a
        // queue, and only the first call in a microtask drains that queue and
        // invokes EVERY queued update's accept callback inside itself. Scoping
        // there put concurrent updates in one scope, so a fetch failure in the
        // first update silently swallowed an unrelated accept-callback error in
        // the second — reproduced against a real HMRClient in
        // `tests/hmr-error-forwarding/client-updates.test.ts`.
        //
        // fetchUpdate is the per-update unit: it performs that one update's
        // import, so the evaluator's and the logger's reports land in its scope,
        // and it RETURNS that update's accept callback. Capturing the scope in
        // the returned closure is what carries the attribution across into the
        // batch that eventually invokes it.
        const client = environment.runner.hmrClient;
        if (client === undefined) {
          throw new VueTuiViteHmrCompatibilityError();
        }
        const internals = client as unknown as HmrClientInternals;
        const baseFetchUpdate = internals.fetchUpdate;
        if (typeof baseFetchUpdate !== "function" || !(internals.hotModulesMap instanceof Map)) {
          throw new VueTuiViteHmrCompatibilityError();
        }
        const fetchUpdate = baseFetchUpdate.bind(internals);
        internals.fetchUpdate = async (update: HmrUpdate) => {
          const scope: UpdateScope = {
            boundaryPath: update.path,
            acceptedPath: update.acceptedPath,
            reported: 0,
          };
          const reportAcceptFailure = (error: unknown): void => {
            // Report only when nothing was reported while fetching THIS
            // update. A compiler-generated callback destructures its
            // argument, so an update whose import failed makes it throw a
            // TypeError about `undefined` — reporting that would replace the
            // developer's real error with a consequence of it.
            if (scope.reported === 0) tryForward(asReportableError(error), "evaluate");
          };

          // `fetchUpdate` hides the registered accept callbacks inside the
          // closure it returns, and that closure ignores each callback's
          // return value. Guard a per-update copy of the registrations before
          // Vite captures them. The original array is restored immediately,
          // before the first await, so two updates for the same module cannot
          // stack wrappers or inherit each other's scope.
          const hotModule = internals.hotModulesMap?.get(update.path);
          const originalCallbacks = hotModule?.callbacks;
          if (hotModule !== undefined && originalCallbacks !== undefined) {
            hotModule.callbacks = originalCallbacks.map((registration) => ({
              ...registration,
              fn(modules) {
                try {
                  void Promise.resolve(registration.fn(modules)).catch(reportAcceptFailure);
                } catch (error) {
                  reportAcceptFailure(error);
                }
              },
            }));
          }

          let fetched: Promise<AcceptCallback | undefined>;
          try {
            fetched = updateScope.run(scope, () => fetchUpdate(update));
          } finally {
            if (hotModule !== undefined && originalCallbacks !== undefined) {
              hotModule.callbacks = originalCallbacks;
            }
          }

          let callback: AcceptCallback | undefined;
          try {
            callback = await fetched;
          } catch (error) {
            // A disposer runs before Vite enters fetchUpdate's own try/catch.
            // Contain that rejection at the per-update seam: letting it reach
            // queueUpdate rejects Promise.all and discards every healthy
            // callback already fetched for the same batch.
            if (scope.reported === 0) tryForward(asReportableError(error), "evaluate");
            return;
          }
          if (callback === undefined) return callback;
          return () => {
            try {
              updateScope.run(scope, callback);
            } catch (error) {
              // This is now only an error in Vite's own returned closure:
              // registered callbacks have their own sync and async guards
              // above. It is still reportable and must not abort the batch.
              reportAcceptFailure(error);
            }
            // Swallowed, not rethrown, for a second reason: Vite runs the
            // batch as `callbacks.forEach(fn => fn())`, so one module's throw
            // would otherwise skip every later module's update as well.
          };
        };
        const queueUpdate = client.queueUpdate.bind(client);
        client.queueUpdate = async (payload) => {
          try {
            await queueUpdate(payload);
          } catch (error) {
            // A failure here belongs to Vite's batch machinery rather than one
            // fetch or callback; both of those are contained above.
            tryForward(asReportableError(error), "evaluate");
          }
        };
        return environment;
      };

      return { dev: { createEnvironment: installedFactory } };
    },
    configResolved(config) {
      if (installedFactory === undefined) return;
      const devOptions = config.environments.ssr?.dev;
      if (devOptions?.createEnvironment !== installedFactory) {
        throw new VueTuiSsrEnvironmentFactoryConflictError(REPLACED_REASON);
      }

      const enumerable =
        Object.getOwnPropertyDescriptor(devOptions, "createEnvironment")?.enumerable ?? true;
      Object.defineProperty(devOptions, "createEnvironment", {
        configurable: false,
        enumerable,
        get: () => installedFactory,
        set: (nextFactory: SsrEnvironmentFactory | undefined) => {
          if (nextFactory !== installedFactory) {
            throw new VueTuiSsrEnvironmentFactoryConflictError(REPLACED_REASON);
          }
        },
      });
    },
    // This runs during resolveConfig, before _createServer calls the factory, so
    // a replacement installed after ours resolved is caught before the replaced
    // factory can run. The configureServer guard below makes the same comparison
    // but only after that call would already have happened.
    applyToEnvironment(environment) {
      if (
        environment.name === "ssr" &&
        installedFactory !== undefined &&
        environment.config.dev.createEnvironment !== installedFactory
      ) {
        throw new VueTuiSsrEnvironmentFactoryConflictError(REPLACED_REASON);
      }
      return true;
    },
    // The second check below covers a window the earlier ones cannot see:
    // `server.environments.ssr` is writable, and an assignment from another
    // plugin's configureServer takes effect — measured, not inferred. No test
    // covers that window, so this guard is the only thing that catches it.
    configureServer(server) {
      if (
        installedFactory !== undefined &&
        (server.config.environments.ssr?.dev.createEnvironment !== installedFactory ||
          !createdEnvironments.has(server.environments.ssr))
      ) {
        throw new VueTuiSsrEnvironmentFactoryConflictError(REPLACED_REASON);
      }
    },
  };
}

function serializeError(error: Error, phase: ErrorPhase): ErrorPayload["err"] {
  return Object.assign({}, error, {
    name: error.name,
    message: error.message,
    stack: error.stack ?? "",
    phase,
  });
}
