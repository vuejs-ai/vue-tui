import patchConsole from "patch-console";
import type { CoordinatedWriteResult } from "./output-coordinator.ts";

type ConsoleStream = "stdout" | "stderr";
type ConsoleSink = (stream: ConsoleStream, data: string) => CoordinatedWriteResult | undefined;

interface ConsoleSinkEntry {
  readonly sink: ConsoleSink;
  readonly queue: Array<{ readonly stream: ConsoleStream; readonly data: string }>;
  active: boolean;
  flushing: boolean;
  idlePromise: Promise<void>;
  resolveIdle: (() => void) | null;
}

export interface ConsoleSinkRegistration {
  readonly release: () => void;
  readonly waitForIdle: () => Promise<void>;
  readonly isIdle: () => boolean;
}

const entries: ConsoleSinkEntry[] = [];
let restorePatch: (() => void) | null = null;

function startIdleCycle(entry: ConsoleSinkEntry): void {
  if (entry.resolveIdle) return;
  entry.idlePromise = new Promise<void>((resolve) => {
    entry.resolveIdle = resolve;
  });
}

function finishIdleCycle(entry: ConsoleSinkEntry): void {
  const resolve = entry.resolveIdle;
  entry.resolveIdle = null;
  resolve?.();
}

function flush(entry: ConsoleSinkEntry): void {
  if (entry.flushing) return;
  entry.flushing = true;

  const advance = (): void => {
    while (entry.queue.length > 0) {
      const record = entry.queue[0]!;
      let result: CoordinatedWriteResult | undefined;
      try {
        result = entry.sink(record.stream, record.data);
      } catch {
        entry.queue.shift();
        continue;
      }

      if (result?.status === "blocked") {
        void result.ready.then(advance, advance);
        return;
      }

      entry.queue.shift();
      if (result?.status === "accepted" && !result.writable) {
        void result.ready.then(advance, advance);
        return;
      }
    }

    entry.flushing = false;
    finishIdleCycle(entry);
  };

  advance();
}

function dispatch(stream: ConsoleStream, data: string): void {
  const entry = entries.findLast((candidate) => candidate.active);
  if (!entry) return;
  startIdleCycle(entry);
  entry.queue.push({ stream, data });
  flush(entry);
}

export function registerConsoleSink(sink: ConsoleSink): ConsoleSinkRegistration {
  if (!restorePatch) restorePatch = patchConsole(dispatch);

  const entry: ConsoleSinkEntry = {
    sink,
    queue: [],
    active: true,
    flushing: false,
    idlePromise: Promise.resolve(),
    resolveIdle: null,
  };
  entries.push(entry);

  let released = false;
  return {
    release() {
      if (released) return;
      released = true;
      entry.active = false;
      // A synchronous/emergency teardown can release after Vue cleanup without
      // waiting for an output gate that will be abandoned. Do not let an
      // intercepted record retry through a released sink forever.
      entry.queue.length = 0;
      const index = entries.indexOf(entry);
      if (index >= 0) entries.splice(index, 1);
      if (entries.length === 0 && restorePatch) {
        const restore = restorePatch;
        restorePatch = null;
        restore();
      }
    },
    waitForIdle() {
      return entry.idlePromise;
    },
    isIdle() {
      return entry.queue.length === 0 && !entry.flushing && entry.resolveIdle === null;
    },
  };
}
