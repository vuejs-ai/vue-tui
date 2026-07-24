import assert from "node:assert/strict";
import { collectMemory } from "./memory.ts";

const property = "__VUE_TUI_CAPACITY_MEMORY_POSITIVE_CONTROL__";
const baseline = await collectMemory("measured", 0);
let retained: { readonly index: number; readonly values: readonly number[] }[] | undefined =
  Array.from({ length: 30_000 }, (_, index) => ({
    index,
    values: Array.from({ length: 16 }, (__, offset) => index + offset),
  }));
Object.defineProperty(globalThis, property, {
  configurable: true,
  enumerable: false,
  value: retained,
});
const withRetention = await collectMemory("measured", 1);
assert.ok(
  withRetention.reachableJsMemoryEstimate - baseline.reachableJsMemoryEstimate > 2_000_000,
  "reachable JavaScript memory did not detect the deliberately retained object graph",
);
assert.equal(delete (globalThis as Record<string, unknown>)[property], true);
retained = undefined;
const afterRelease = await collectMemory("measured", 2);
assert.ok(
  withRetention.reachableJsMemoryEstimate - afterRelease.reachableJsMemoryEstimate > 1_000_000,
  "reachable JavaScript memory did not fall after releasing the positive-control graph",
);
