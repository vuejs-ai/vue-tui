import { nextTick, type ComponentPublicInstance } from "vue";
import type { MountOptions, TuiApp } from "./render.ts";
import {
  INTERNAL_KITTY_KEYBOARD,
  type InternalKittyKeyboardMountOptions,
} from "./io/kitty-keyboard.ts";
import { INTERNAL_RENDER_OBSERVER, type InternalRenderObserver } from "./io/render-observer.ts";
import { getSharedStdinIngress, type SharedStdinIngress } from "./io/stdin-ingress.ts";
import { createManualSuspensionHost, INTERNAL_SUSPENSION_HOST } from "./process-suspension.ts";
import { INTERNAL_TERMINAL_SIZE_PROBE, type TerminalSizeProbe } from "./terminal-size-probe.ts";

export interface TestContentFrame {
  readonly dynamic: string;
  readonly staticOutput: string;
}

export interface TestHostBridgeOptions {
  readonly onFrame?: (frame: TestContentFrame) => void;
}

export interface TestHostBridge {
  mount(app: TuiApp, options?: MountOptions): ComponentPublicInstance;
  writeInput(data: string | Uint8Array): Promise<void>;
  suspend(): Promise<void>;
  resume(): Promise<void>;
}

type TestingMountOptions = MountOptions & {
  readonly maxFps?: number;
  [INTERNAL_KITTY_KEYBOARD]?: InternalKittyKeyboardMountOptions;
  [INTERNAL_RENDER_OBSERVER]?: InternalRenderObserver;
  [INTERNAL_SUSPENSION_HOST]?: ReturnType<typeof createManualSuspensionHost>;
  [INTERNAL_TERMINAL_SIZE_PROBE]?: TerminalSizeProbe;
};

function normalizeOptions(options: TestHostBridgeOptions): TestHostBridgeOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new TypeError("test host bridge options must be an object.");
  }
  for (const key of Object.keys(options)) {
    if (key !== "onFrame") throw new TypeError(`Unknown test host bridge option "${key}".`);
  }
  const onFrame = options.onFrame;
  if (onFrame !== undefined && typeof onFrame !== "function") {
    throw new TypeError("test host bridge onFrame must be a function.");
  }
  return { onFrame };
}

export function createTestHostBridge(options: TestHostBridgeOptions = {}): TestHostBridge {
  const normalized = normalizeOptions(options);
  const suspensionHost = createManualSuspensionHost();
  let phase: "created" | "mounting" | "active" | "suspended" | "inactive" = "created";
  let app: TuiApp | undefined;
  let ingress: SharedStdinIngress | undefined;
  let operationQueue: Promise<void> = Promise.resolve();
  const isInactive = (): boolean => phase === "inactive";

  async function settleRuntimeWork(activeApp: TuiApp): Promise<void> {
    await nextTick();
    await activeApp.waitUntilRenderFlush();
    // A resume/input operation may synchronously schedule Vue's error-exit
    // turn after the render barrier it just completed. Let that already-queued
    // lifecycle work settle without subscribing to any future application work.
    await new Promise<void>((resolve) => setImmediate(resolve));
    // The flush barrier deliberately does not report lifecycle errors. Test
    // operations still surface an exit they triggered through the authoritative
    // app barrier, while a clean exit remains a successful operation.
    if (isInactive()) await activeApp.waitUntilExit();
  }

  const observer: InternalRenderObserver = {
    onCommit(frame) {
      if (frame.phase === "teardown") {
        phase = "inactive";
        return;
      }
      normalized.onFrame?.(
        Object.freeze({ dynamic: frame.dynamic, staticOutput: frame.staticOutput }),
      );
    },
  };

  const assertActive = (): { readonly app: TuiApp; readonly ingress: SharedStdinIngress } => {
    if (phase === "created" || phase === "mounting") {
      throw new Error("Test host bridge has not mounted an application.");
    }
    if (phase === "inactive" || !app || !ingress) {
      throw new Error("Test host bridge application is no longer mounted.");
    }
    if (phase === "suspended") throw new Error("Test host bridge is suspended.");
    return { app, ingress };
  };

  const enqueue = <T>(operation: () => Promise<T>): Promise<T> => {
    const pending = operationQueue.then(operation, operation);
    operationQueue = pending.then(
      () => undefined,
      () => undefined,
    );
    return pending;
  };

  const bridge: TestHostBridge = {
    mount(targetApp: TuiApp, mountOptions: MountOptions = {}) {
      if (phase !== "created") throw new Error("Test host bridge mount() can be called only once.");
      phase = "mounting";

      if (
        typeof mountOptions !== "object" ||
        mountOptions === null ||
        Array.isArray(mountOptions)
      ) {
        phase = "inactive";
        throw new TypeError("test host bridge mount options must be an object.");
      }

      // Snapshot public option accessors once, then let Runtime perform its
      // ordinary validation before it mutates Vue or terminal state.
      // Test hosts observe renderer commits directly. Keep those commits
      // unthrottled so one Vue update turn deterministically produces its
      // corresponding content observation, independent of wall-clock timing.
      const resolvedOptions: TestingMountOptions = { ...mountOptions, maxFps: 0 };
      const stdin = resolvedOptions.stdin ?? process.stdin;
      resolvedOptions[INTERNAL_RENDER_OBSERVER] = observer;
      resolvedOptions[INTERNAL_SUSPENSION_HOST] = suspensionHost;
      resolvedOptions[INTERNAL_TERMINAL_SIZE_PROBE] = () => ({ kind: "unavailable" });
      resolvedOptions[INTERNAL_KITTY_KEYBOARD] = { mode: "disabled" };

      try {
        const instance = targetApp.mount(resolvedOptions);
        app = targetApp;
        ingress = getSharedStdinIngress(stdin as NodeJS.ReadStream);
        phase = "active";
        void targetApp.waitUntilExit().then(
          () => {
            phase = "inactive";
          },
          () => {
            phase = "inactive";
          },
        );
        return instance;
      } catch (error) {
        phase = "inactive";
        throw error;
      }
    },
    writeInput(data: string | Uint8Array) {
      const input = typeof data === "string" ? data : Uint8Array.from(data);
      return enqueue(async () => {
        const active = assertActive();
        await active.ingress.writeForTest(input);
        await settleRuntimeWork(active.app);
        if (!isInactive()) assertActive();
      });
    },
    suspend() {
      return enqueue(async () => {
        assertActive();
        phase = "suspended";
        await suspensionHost.suspend();
        if (isInactive()) {
          throw new Error("Test host bridge application is no longer mounted.");
        }
      });
    },
    resume() {
      return enqueue(async () => {
        if (phase !== "suspended" || !app || !ingress) {
          throw new Error("Test host bridge is not suspended.");
        }
        await suspensionHost.resume();
        if (isInactive()) {
          throw new Error("Test host bridge application is no longer mounted.");
        }
        phase = "active";
        await settleRuntimeWork(app);
        if (isInactive()) {
          await app.waitUntilExit();
          throw new Error("Test host bridge application is no longer mounted.");
        }
        assertActive();
      });
    },
  };
  return Object.freeze(bridge);
}
