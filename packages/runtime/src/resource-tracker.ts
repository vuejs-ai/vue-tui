/**
 * Runtime-owned resources and cleanup obligations that can outlive one call stack.
 * Listener fields count Runtime registrations, not pooled Node listener fan-out;
 * terminal lease fields count restoration obligations, not inferred terminal state.
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
  "caretOwners",
  "pointerHosts",
  "pointerHandlers",
  "dragHandlers",
  "selectionOwners",
  "surfaceLeases",
  "rawLeases",
  "pasteLeases",
  "kittyLeases",
  "mouseLeases",
  "cursorLeases",
  "synchronizedOutputLeases",
  "streamReservations",
] as const;

export type RuntimeResourceKind = (typeof runtimeResourceKinds)[number];
export type RuntimeResourceSnapshot = Readonly<Record<RuntimeResourceKind, number>>;

const live = Object.fromEntries(runtimeResourceKinds.map((kind) => [kind, 0])) as Record<
  RuntimeResourceKind,
  number
>;

export function changeRuntimeResource(kind: RuntimeResourceKind, delta: number): void {
  if (!Number.isSafeInteger(delta))
    throw new TypeError("Runtime resource delta must be an integer");
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
    return Object.freeze({ ...live });
  },
});
