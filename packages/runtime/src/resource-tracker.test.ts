import { describe, expect, test } from "vite-plus/test";
import {
  acquireRuntimeResource,
  changeRuntimeResource,
  runtimeResourceKinds,
  runtimeResourceTracker,
} from "./resource-tracker.ts";

describe("runtimeResourceTracker", () => {
  test("publishes the finite resource contract in stable order", () => {
    expect(runtimeResourceKinds).toEqual([
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
    ]);
  });

  test("returns frozen copies and releases acquisitions exactly once", () => {
    const before = runtimeResourceTracker.snapshot();
    const release = acquireRuntimeResource("geometryBindings");
    const during = runtimeResourceTracker.snapshot();

    expect(Object.isFrozen(during)).toBe(true);
    expect(during.geometryBindings).toBe(before.geometryBindings + 1);
    expect(before.geometryBindings).toBe(runtimeResourceTracker.snapshot().geometryBindings - 1);

    release();
    release();
    expect(runtimeResourceTracker.snapshot()).toEqual(before);
  });

  test("rejects invalid deltas and underflow without mutating the snapshot", () => {
    const before = runtimeResourceTracker.snapshot();
    expect(() => changeRuntimeResource("inputTimers", 0.5)).toThrow(/integer/);
    expect(() => changeRuntimeResource("inputTimers", -before.inputTimers - 1)).toThrow(/negative/);
    expect(runtimeResourceTracker.snapshot()).toEqual(before);
  });
});
