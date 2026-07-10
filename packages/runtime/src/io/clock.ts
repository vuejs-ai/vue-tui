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
 * `clearTimeout`, so the type is deliberately opaque.
 */
export type ClockTimeout = unknown;

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
