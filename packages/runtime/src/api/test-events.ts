type TestEventSink = (line: string) => void;

interface TestEventState {
  sequence: number;
  sink: TestEventSink | undefined;
}

const TEST_EVENT_STATE_KEY = "__vue_tui_test_event_state__";

function sharedTestEventState(): TestEventState {
  const shared = globalThis as typeof globalThis & {
    [TEST_EVENT_STATE_KEY]?: TestEventState;
  };
  return (shared[TEST_EVENT_STATE_KEY] ??= {
    sequence: 0,
    sink: undefined,
  });
}

export function setTestEventSink(sink: TestEventSink): void {
  sharedTestEventState().sink = sink;
}

export function hasTestEventSink(): boolean {
  return sharedTestEventState().sink !== undefined;
}

/**
 * Events the runtime itself reports. Named here rather than written as string
 * literals on both sides: renaming one used to type-check cleanly and turn every
 * waiter that expected it into a wall-clock timeout in a child process.
 */
export const RUNTIME_TEST_EVENT = Object.freeze({
  terminalAcquired: "terminal:acquired",
  terminalReleased: "terminal:released",
  paintCommitted: "paint:committed",
  hmrUpdateReceived: "hmr:update-received",
  hmrUpdateApplied: "hmr:update-applied",
  hmrError: "hmr:error",
} as const);

export type RuntimeTestEvent = (typeof RUNTIME_TEST_EVENT)[keyof typeof RUNTIME_TEST_EVENT];

export function emitTestEvent(event: string, data?: unknown): void {
  const state = sharedTestEventState();
  if (state.sink === undefined) return;

  try {
    const payload =
      data === undefined
        ? { seq: ++state.sequence, ev: event }
        : { seq: ++state.sequence, ev: event, data };
    state.sink(JSON.stringify(payload));
  } catch {
    // Test reporting must never change the production path it observes.
  }
}
