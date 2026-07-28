// Scaffolding every end-to-end file needs. It lived as a copy per file until one
// of them drifted, so it is exported from one place now.
import type { TestEvent } from "./events.ts";
import { launchViteChild, type LaunchViteChildOptions, type ViteChild } from "./child.ts";
import type { ScratchFixture } from "./scratch.ts";

/** Dispose the child first, then remove its scratch fixture, even if disposal throws. */
export async function cleanup(
  child: ViteChild | undefined,
  scratch: ScratchFixture,
): Promise<void> {
  try {
    await child?.dispose();
  } finally {
    scratch.cleanup();
  }
}

/**
 * Run a body against a live child, then dispose it and its fixture.
 *
 * Every end-to-end test opened with the same `let child: ViteChild | undefined`
 * plus try/finally, and that `| undefined` forced `child?.`/`child!` through
 * bodies that only ever run after a successful launch. Prepare the fixture with
 * ordinary code before the call; the child's lifetime is the callback's.
 */
export async function withViteChild(
  scratch: ScratchFixture,
  run: (child: ViteChild) => Promise<void>,
  options?: LaunchViteChildOptions,
): Promise<void> {
  let child: ViteChild | undefined;
  try {
    child = await launchViteChild(scratch.root, options);
    await run(child);
  } finally {
    await cleanup(child, scratch);
  }
}

/**
 * The counter as the app currently renders it.
 *
 * Deliberately the LAST match. `screen()` is the terminal VIEWPORT — xterm is
 * configured with scrollback but the harness reads only `rows` lines from
 * `viewportY` — and inline mode reprints a whole frame per commit, so several
 * past frames are usually still visible above the current one. The first
 * `count=` is therefore the oldest value still on screen, not the current one.
 * Two copies of this helper disagreed on exactly that, and only agreed because
 * the fixtures happen to render one counter.
 */
export function latestCount(screen: string): number | undefined {
  const value = [...screen.matchAll(/count=(\d+)/g)].at(-1)?.[1];
  return value === undefined ? undefined : Number(value);
}

export function hasCountAtLeast(screen: string, minimum: number): boolean {
  const count = latestCount(screen);
  return count !== undefined && count >= minimum;
}

export function eventPhase(event: TestEvent): string | undefined {
  return (event.data as { phase?: string } | undefined)?.phase;
}

export function eventKind(event: TestEvent): string | undefined {
  return (event.data as { kind?: string } | undefined)?.kind;
}

/**
 * Leave Vite's current file-change notification window before writing the same
 * path again.
 *
 * These tests can repair a fixture much faster than a person can save it.
 * Vite 8.1's watcher suppresses another `change` for the same path for 50ms,
 * even when the file contents changed, so an immediate synthetic recovery can
 * be invisible to Vite. Start this wait only after observing the first update's
 * result; paint traffic is unrelated and may continue indefinitely.
 */
export async function settleViteWatchChange(child: ViteChild): Promise<void> {
  await child.quiesce(100, {
    ignore: (event) => event.ev === "paint:committed",
  });
}

/**
 * The dev overlay's bordered panel, taken from a frame.
 *
 * Scoping to the frame is not enough on its own for a claim about the overlay:
 * a frame carries the user's tree as well, so "the overlay says X" needs the
 * panel. Scoping to the panel alone is not enough either — on the whole screen
 * it would still see Vite's coordinated log lines. Both, together.
 */
export function errorPanel(frame: string | undefined): string | undefined {
  if (frame === undefined) return undefined;
  const lines = frame.split("\n");
  const start = lines.findIndex((line) => /[│|]\s*(Build|Render) Error/.test(line));
  if (start === -1) return undefined;
  const end = lines.findIndex((line, index) => index > start && /[╰└]/.test(line));
  return lines.slice(start, end === -1 ? undefined : end + 1).join("\n");
}
