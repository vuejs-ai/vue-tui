export interface HeartbeatSample {
  readonly observedAt: number;
  readonly excessDelay: number;
}

export interface PercentileSummary {
  readonly count: number;
  readonly maximum: number;
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
}

export function nearestRank(samples: readonly number[], percentile: number): number {
  if (samples.length === 0) return 0;
  if (!(percentile > 0 && percentile <= 1)) {
    throw new RangeError("percentile must be greater than zero and no greater than one");
  }
  const sorted = [...samples].sort((left, right) => left - right);
  return sorted[Math.ceil(percentile * sorted.length) - 1]!;
}

export function summarize(samples: readonly number[]): PercentileSummary {
  return Object.freeze({
    count: samples.length,
    maximum: samples.length === 0 ? 0 : Math.max(...samples),
    p50: nearestRank(samples, 0.5),
    p95: nearestRank(samples, 0.95),
    p99: nearestRank(samples, 0.99),
  });
}

export interface Heartbeat {
  readonly samples: readonly HeartbeatSample[];
  stop(): void;
}

export function startHeartbeat(interval = 20): Heartbeat {
  const samples: HeartbeatSample[] = [];
  let active = true;
  let expectedAt = performance.now() + interval;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const beat = (): void => {
    if (!active) return;
    const observedAt = performance.now();
    samples.push(
      Object.freeze({
        observedAt,
        excessDelay: Math.max(0, observedAt - expectedAt),
      }),
    );
    expectedAt = observedAt + interval;
    timer = setTimeout(beat, interval);
  };

  timer = setTimeout(beat, interval);
  return Object.freeze({
    samples,
    stop() {
      if (!active) return;
      active = false;
      if (timer !== undefined) clearTimeout(timer);
    },
  });
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!;
}
