// Curated spinner presets. Inclusion bar (see .agents/docs/components/spinner.md):
// universal default + functional fallback only, every frame width-safe (1 column).
// Everything else is reachable via the `frames`/`interval` escape hatch.
export const PRESETS = {
  dots: { interval: 80, frames: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] },
  line: { interval: 130, frames: ["-", "\\", "|", "/"] },
} satisfies Record<string, { interval: number; frames: string[] }>;

export type PresetName = keyof typeof PRESETS;

/** Resolve effective `{ frames, interval }` from spinner props. Custom `frames` win;
 *  an empty `frames` array and an unknown `type` both fall back to `dots`; `interval`
 *  overrides in either mode. Pure — no rendering, no timers. */
export function resolveSpinner(opts: {
  type?: string;
  frames?: readonly string[];
  interval?: number;
}): { frames: string[]; interval: number } {
  if (opts.frames?.length) {
    return { frames: [...opts.frames], interval: opts.interval ?? 80 };
  }
  const p = PRESETS[opts.type as PresetName] ?? PRESETS.dots;
  return { frames: p.frames, interval: opts.interval ?? p.interval };
}
