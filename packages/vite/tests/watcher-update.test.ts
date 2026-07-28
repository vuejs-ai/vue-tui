import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vite-plus/test";
import { createWatcherUpdateTracker } from "../src/watcher-update.ts";

function update(file: string, timestamp: number) {
  return { type: "update", file, timestamp };
}

test("keeps each watcher decision immutable when Vite environments interleave", () => {
  const sandbox = mkdtempSync(join(tmpdir(), "vue-tui-watcher-update-"));
  const file = join(sandbox, "app.tsx");
  try {
    writeFileSync(file, "export const value = 1;\n");
    const tracker = createWatcherUpdateTracker();

    // Vite does not serialize watcher tasks: the second client hook can run
    // before the first task reaches SSR. Each later environment must read its
    // timestamp's original decision, not whichever file decision ran last.
    expect(tracker.observe(update(file, 101))).toBe(false); // client 101
    expect(tracker.observe(update(file, 202))).toBe(true); // client 202
    expect(tracker.observe(update(file, 101))).toBe(false); // SSR 101
    expect(tracker.observe(update(file, 202))).toBe(true); // SSR 202
    expect(tracker.isDuplicate(101)).toBe(false);
    expect(tracker.isDuplicate(202)).toBe(true);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test("same-length source changes proceed and unreadable files fail open", () => {
  const sandbox = mkdtempSync(join(tmpdir(), "vue-tui-source-state-"));
  const file = join(sandbox, "app.tsx");
  try {
    const first = "export const first = 1;\n";
    const second = "export const other = 2;\n";
    expect(Buffer.byteLength(second)).toBe(Buffer.byteLength(first));

    const tracker = createWatcherUpdateTracker();
    writeFileSync(file, first);
    expect(tracker.observe(update(file, 101))).toBe(false);
    expect(tracker.observe(update(file, 202))).toBe(true);

    // Content participates in the identity, so a coarse filesystem timestamp
    // cannot hide a real same-size edit.
    writeFileSync(file, second);
    expect(tracker.observe(update(file, 303))).toBe(false);

    rmSync(file);
    expect(tracker.observe(update(file, 404))).toBe(false);
    expect(tracker.observe(update(file, 505))).toBe(false);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test("evicted decisions fail open", () => {
  const sandbox = mkdtempSync(join(tmpdir(), "vue-tui-watcher-bound-"));
  const file = join(sandbox, "app.tsx");
  try {
    writeFileSync(file, "export const value = 1;\n");
    const tracker = createWatcherUpdateTracker();
    for (let timestamp = 1; timestamp <= 200; timestamp++) {
      tracker.observe(update(file, timestamp));
    }

    expect(tracker.isDuplicate(2)).toBe(false);
    expect(tracker.observe(update(file, 2))).toBe(false);
    expect(tracker.isDuplicate(2)).toBe(false);
    expect(tracker.isDuplicate(200)).toBe(true);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test("a timestamp collision fails open for both files", () => {
  const sandbox = mkdtempSync(join(tmpdir(), "vue-tui-watcher-collision-"));
  const first = join(sandbox, "first.tsx");
  const second = join(sandbox, "second.tsx");
  try {
    writeFileSync(first, "export const value = 1;\n");
    writeFileSync(second, "export const value = 2;\n");
    const tracker = createWatcherUpdateTracker();
    tracker.observe(update(first, 101));
    expect(tracker.observe(update(first, 202))).toBe(true);

    expect(tracker.observe(update(second, 202))).toBe(false);
    expect(tracker.isDuplicate(202)).toBe(false);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});
