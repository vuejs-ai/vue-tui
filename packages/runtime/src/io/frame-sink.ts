/**
 * Internal, test-only frame observer.
 *
 * The `@vue-tui/testing` `render()` helper needs to capture each committed
 * frame's CONTENT, with no terminal-control escapes mixed in. Reverse-
 * engineering frames out of the stdout byte stream is fragile: stdout must stay
 * byte-faithful to Ink (cursor hide/show, bracketed-paste enable/disable, BSU/
 * ESU, etc.), so any escape the runtime legitimately writes leaks into the
 * captured frames.
 *
 * Instead, the runtime exposes this per-app frame sink: a callback that the
 * commit path invokes with the EXACT content chunks it writes to stdout (the
 * accumulated `<Static>` history chunk, then the dynamic frame), in write order
 * — but NOT the escapes. The helper passes a sink via a Symbol-keyed mount
 * option (so it never appears on the public `MountOptions` type, keeping that
 * Ink-faithful) and builds `frames[]` / `lastFrame()` from the callbacks.
 *
 * The sink is closure-captured per `mount()` call — there is NO module-global
 * mutable state — so concurrent test files / multiple apps are fully isolated.
 *
 * This is intentionally NOT a public API: it lives behind `@vue-tui/runtime/
 * internal` and is keyed by a unique symbol the runtime reads off the loosely
 * typed mount options.
 */
export type FrameSink = (chunk: string) => void;

/**
 * Symbol key for the internal frame sink on the mount options object. Unique
 * (created via `Symbol(...)`, not `Symbol.for(...)`) so it can never collide
 * with a user-supplied key and is invisible to normal property enumeration.
 */
export const INTERNAL_FRAME_SINK: unique symbol = Symbol("vue-tui.internal.frameSink");
