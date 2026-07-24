/**
 * Runtime-owned resources and cleanup obligations that can outlive one call stack.
 * Listener fields count Runtime registrations, not pooled Node listener fan-out;
 * terminal lease fields count restoration obligations, not inferred terminal state.
 *
 * Counters live on globalThis so every Runtime module copy in the process (externalized
 * Node resolution, Vitest-transformed source, monorepo SSR graphs) shares one ledger.
 * Module-local state would fork under those graphs and hide server-close leaks.
 */
export const runtimeResourceKinds = [
  "lifecycleTransactions",
  "preparedFrames",
  "schedulerTimers",
  "inputTimers",
  "processListeners",
  "streamListeners",
  "focusTargets",
  "geometryBindings",
  "surfaceLeases",
  "rawLeases",
  "pasteLeases",
  "kittyLeases",
  "cursorLeases",
  "synchronizedOutputLeases",
  "streamReservations",
] as const;

export type RuntimeResourceKind = (typeof runtimeResourceKinds)[number];
export type RuntimeResourceSnapshot = Readonly<Record<RuntimeResourceKind, number>>;

const GLOBAL_KEY = "__vue_tui_runtime_resources__";

function liveCounters(): Record<RuntimeResourceKind, number> {
  const g = globalThis as typeof globalThis & {
    [GLOBAL_KEY]?: Record<RuntimeResourceKind, number>;
  };
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = Object.fromEntries(runtimeResourceKinds.map((kind) => [kind, 0])) as Record<
      RuntimeResourceKind,
      number
    >;
  }
  return g[GLOBAL_KEY];
}

export function changeRuntimeResource(kind: RuntimeResourceKind, delta: number): void {
  if (!Number.isSafeInteger(delta))
    throw new TypeError("Runtime resource delta must be an integer");
  const live = liveCounters();
  const next = live[kind] + delta;
  if (next < 0) throw new Error(`Runtime resource counter ${kind} cannot become negative`);
  live[kind] = next;
}

export function acquireRuntimeResource(kind: RuntimeResourceKind): () => void {
  changeRuntimeResource(kind, 1);
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    changeRuntimeResource(kind, -1);
  };
}

export const runtimeResourceTracker = Object.freeze({
  /** Return an immutable point-in-time copy. Callers compare snapshots; there is no reset escape. */
  snapshot(): RuntimeResourceSnapshot {
    return Object.freeze({ ...liveCounters() });
  },
});
