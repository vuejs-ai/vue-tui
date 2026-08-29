// Curated spinner presets. Inclusion bar (see .agents/docs/components/spinner.md):
// universal default + functional fallback only, every frame width-safe (1 column).
// Everything else is reachable via the `frames`/`interval` escape hatch.
export const PRESETS = {
  dots: { interval: 80, frames: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] },
  line: { interval: 130, frames: ["-", "\\", "|", "/"] },
} satisfies Record<string, { interval: number; frames: string[] }>;

export type PresetName = keyof typeof PRESETS;

// `setInterval` stores its delay in a signed 32-bit integer, so a larger value wraps
// and fires about every millisecond instead of never.
const MAX_INTERVAL = 2_147_483_647;

function describeInterval(value: unknown): string {
  // `JSON.stringify` keeps a string quoted, which is what distinguishes the common
  // `<Spinner interval="80" />` template mistake from a number, but it renders NaN
  // and Infinity as `null`. Name those directly.
  return typeof value === "string" ? JSON.stringify(value) : String(value);
}

function readInterval(interval: number | undefined, fallback: number): number {
  if (interval === undefined) return fallback;
  if (!Number.isSafeInteger(interval) || interval < 1 || interval > MAX_INTERVAL) {
    throw new TypeError(
      `<Spinner> prop "interval" must be an integer between 1 and ${MAX_INTERVAL} milliseconds, received ${describeInterval(interval)}.`,
    );
  }
  return interval;
}

/** Resolve effective `{ frames, interval }` from spinner props. Custom `frames` win;
 *  an empty `frames` array and an unknown `type` both fall back to `dots`; `interval`
 *  overrides in either mode. Pure — no rendering, no timers. */
export function resolveSpinner(opts: {
  type?: string;
  frames?: readonly string[];
  interval?: number;
}): { frames: string[]; interval: number } {
  if (opts.frames?.length) {
    return { frames: [...opts.frames], interval: readInterval(opts.interval, 80) };
  }
  // `Object.hasOwn`, not a bracket lookup with `??`: a plain object literal inherits
  // `Object.prototype`, so `type="toString"` or `type="__proto__"` would otherwise
  // resolve to an inherited member and defeat the fallback.
  const p =
    opts.type !== undefined && Object.hasOwn(PRESETS, opts.type)
      ? PRESETS[opts.type as PresetName]
      : PRESETS.dots;
  return { frames: p.frames, interval: readInterval(opts.interval, p.interval) };
}
