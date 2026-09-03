import { nextTick, type ComponentPublicInstance } from "vue";
import { mountWithInternalOptions, type TuiApp } from "../render.ts";
import type { MountOptions } from "./mount-options.ts";
import { INTERNAL_KITTY_KEYBOARD } from "../terminal/kitty-keyboard.ts";
import { INTERNAL_RENDER_OBSERVER, type InternalRenderObserver } from "./render-observer.ts";
import { createNodeTestHostMountFacts, type NodeTestHostMountFacts } from "./node-testing.ts";
import {
  createManualSuspensionHost,
  INTERNAL_SUSPENSION_HOST,
} from "../terminal/node/process-suspension.ts";
import { INTERNAL_TERMINAL_SIZE_PROBE } from "../terminal/node/terminal-size-probe.ts";
import { createInternalMountOptions } from "./internal-mount-options.ts";

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
  let writeInput: NodeTestHostMountFacts["writeInput"] | undefined;
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

  const assertActive = (): {
    readonly app: TuiApp;
    readonly writeInput: NodeTestHostMountFacts["writeInput"];
  } => {
    if (phase === "created" || phase === "mounting") {
      throw new Error("Test host bridge has not mounted an application.");
    }
    if (phase === "inactive" || !app || !writeInput) {
      throw new Error("Test host bridge application is no longer mounted.");
    }
    if (phase === "suspended") throw new Error("Test host bridge is suspended.");
    return { app, writeInput };
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
      const publicOptions = { ...mountOptions };
      const nodeFacts = createNodeTestHostMountFacts(publicOptions);
      const resolvedOptions = createInternalMountOptions({
        ...publicOptions,
        maxFps: 0,
        // The official test host models output capability explicitly instead
        // of inheriting the test worker's FORCE_COLOR / NO_COLOR state.
        terminalStyle: nodeFacts.terminalStyle,
        [INTERNAL_RENDER_OBSERVER]: observer,
        [INTERNAL_SUSPENSION_HOST]: suspensionHost,
        [INTERNAL_TERMINAL_SIZE_PROBE]: () => ({ kind: "unavailable" }),
        [INTERNAL_KITTY_KEYBOARD]: { mode: "disabled" },
      });

      try {
        const instance = mountWithInternalOptions(targetApp, resolvedOptions);
        app = targetApp;
        writeInput = (data) => nodeFacts.writeInput(data);
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
        await active.writeInput(input);
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
        if (phase !== "suspended" || !app || !writeInput) {
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
