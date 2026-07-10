/**
 * Injected time — the runtime's sanctioned way to read the clock and arm
 * timers (design record: .agents/docs/clock.md).
 *
 * Production behavior is unchanged: when no clock is injected, every consumer
 * keeps its historic global read (`Date.now` in the commit scheduler,
 * `performance.now` in the animation scheduler, global `setTimeout`
 * everywhere). Injecting a clock through the Symbol-keyed mount option swaps
 * the time source wholesale for that app, which is what lets vue-tui's own
 * tests drive timing deterministically without mutating process globals the
 * way `vi.useFakeTimers` does.
 *
 * Like the frame sink, the clock is closure-captured per `mount()` — no
 * module-global state — and the symbol key never appears on the public
 * `MountOptions` type. This is intentionally NOT a public API; it lives
 * behind `@vue-tui/runtime/internal`.
 */

/**
 * Opaque timer handle. The real clock returns Node's `Timeout`; a virtual
 * clock returns its own ledger entry. Consumers only ever hand it back to
 * `clearTimeout`, so the type is deliberately opaque — `object` rather than
 * `unknown` so it still unions cleanly with `null`/`undefined` sentinels.
 */
export type ClockTimeout = object;

export interface Clock {
  /** Monotonic milliseconds. Consumers use deltas only, never absolute values. */
  now(): number;
  setTimeout(callback: () => void, ms: number): ClockTimeout;
  clearTimeout(handle: ClockTimeout): void;
}

/**
 * Passthrough to the real timers. Every member is a lazy wrapper — never a
 * captured reference — for two load-bearing reasons: a bare `performance.now`
 * reference throws when called (it loses its `this`), and a module-load-
 * captured `setTimeout` would bypass `vi.useFakeTimers` in tests that fake
 * globals and rely on the runtime reading them at fire time.
 */
export const realClock: Clock = {
  now: () => performance.now(),
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * Symbol key for the internal clock on the mount options object. Unique
 * (created via `Symbol(...)`, not `Symbol.for(...)`) so it can never collide
 * with a user-supplied key and is invisible to normal property enumeration.
 */
export const INTERNAL_CLOCK: unique symbol = Symbol("vue-tui.internal.clock");

export interface PendingTimer {
  /** Virtual due time in ms. */
  at: number;
  /** Registration order — the deterministic same-deadline tiebreak. */
  seq: number;
  /** The callback's function name, for debugging hung tests. */
  name: string;
}

export interface VirtualClock extends Clock {
  /**
   * Play `ms` of virtual time forward: fire due timers in `(at, seq)` order,
   * awaiting a real `setImmediate` barrier after every fire so microtasks and
   * `process.nextTick` callbacks (Vue's flush, stream write callbacks) drain
   * exactly as they would between two real timer callbacks. See
   * .agents/docs/clock.md for the full semantics, including what advance()
   * does NOT settle (exit/flush chains — await their surfaced promises).
   */
  advance(ms: number): Promise<void>;
  /** Inspect the ledger — the first thing to print when a test hangs. */
  pendingTimers(): PendingTimer[];
}

interface VirtualTimerEntry {
  at: number;
  seq: number;
  cb: () => void;
}

/**
 * Cap on fires per advance() call. A `0ms` self-rescheduling callback would
 * otherwise loop forever at one virtual instant; no legitimate test comes
 * anywhere near this many fires in a single advance.
 */
const MAX_FIRES_PER_ADVANCE = 10_000;

/**
 * A deterministic clock for vue-tui's own tests (see .agents/docs/clock.md):
 * `setTimeout` starts nothing — it appends to a ledger — and `advance(ms)`
 * plays the recorded future. Virtual time starts at 0. Per-app and
 * mutation-free of globals, so concurrent tests cannot interfere — unlike
 * `vi.useFakeTimers`, which patches process globals.
 */
export function createVirtualClock(): VirtualClock {
  let virtualNow = 0;
  let nextSeq = 0;
  let timers: VirtualTimerEntry[] = [];

  function earliestDue(target: number): VirtualTimerEntry | undefined {
    let earliest: VirtualTimerEntry | undefined;
    for (const t of timers) {
      if (t.at > target) continue;
      if (!earliest || t.at < earliest.at || (t.at === earliest.at && t.seq < earliest.seq)) {
        earliest = t;
      }
    }
    return earliest;
  }

  return {
    now: () => virtualNow,
    setTimeout(callback: () => void, ms: number): ClockTimeout {
      // Mirror Node's timer semantics: the delay is truncated to an integer
      // and clamped to >=1ms, so `setTimeout(fn, 0)` fires one virtual
      // millisecond later — never at the current instant.
      const delay = Number.isFinite(ms) ? Math.max(1, Math.trunc(ms)) : 1;
      const entry: VirtualTimerEntry = { at: virtualNow + delay, seq: nextSeq++, cb: callback };
      timers.push(entry);
      return entry;
    },
    clearTimeout(handle: ClockTimeout): void {
      timers = timers.filter((t) => t !== handle);
    },
    async advance(ms: number): Promise<void> {
      const target = virtualNow + ms;
      let fires = 0;
      for (;;) {
        // Re-query the LIVE ledger every iteration: a fired callback may have
        // registered a timer that is due before anything we saw earlier, and
        // Node semantics require it to fire within this advance.
        const next = earliestDue(target);
        if (!next) break;
        if (++fires > MAX_FIRES_PER_ADVANCE) {
          throw new Error(
            `VirtualClock: runaway timer loop — more than ${MAX_FIRES_PER_ADVANCE} fires in one ` +
              `advance(); next would be "${next.cb.name || "<anonymous>"}" at virtual t=${next.at}ms`,
          );
        }
        timers = timers.filter((t) => t !== next);
        // "Time reaches t" happens before anything scheduled at t observes t.
        // On a callback throw, this ordering plus the splice above IS the
        // documented post-throw state: now rests at the due time, the ledger
        // keeps every remaining timer, and a later advance() continues.
        virtualNow = next.at;
        next.cb();
        // Drain to quiescence before the next fire: when a check-phase
        // setImmediate runs, all microtasks and process.nextTick callbacks
        // have landed — the invariant real timer callbacks always get.
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
      virtualNow = target;
    },
    pendingTimers(): PendingTimer[] {
      return timers
        .map((t) => ({ at: t.at, seq: t.seq, name: t.cb.name || "<anonymous>" }))
        .sort((a, b) => a.at - b.at || a.seq - b.seq);
    },
  };
}
