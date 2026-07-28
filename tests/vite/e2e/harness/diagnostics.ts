import type { TestEvent } from "./events.ts";

/**
 * Everything a failed harness expectation should say, as plain data.
 *
 * Kept pure and separate from the child it describes: this used to be a closure
 * inside `launchViteChild`, which made the single most important output of a
 * failing test — the report a human reads — impossible to test on its own, and
 * kept the entire launch scope alive for the child's lifetime.
 */
export interface ChildDiagnosticSnapshot {
  readonly root: string;
  readonly command: readonly string[];
  /** `undefined` while the child is still running. */
  readonly exit: unknown;
  readonly events: readonly TestEvent[];
  readonly eventChannelFailure: Error | undefined;
  readonly screen: string;
  readonly output: string;
}

const OUTPUT_TAIL_BYTES = 4_096;

/**
 * `paint:committed` carries the whole painted frame, because that is what the
 * frame assertions read. Printing every one of them turns the event log — the
 * part a human scans for the sequence that went wrong — into screens of repeated
 * box drawing. The frames are elided by size; the current screen is printed in
 * full just below, and it is the one that matters.
 */
function forLog(event: TestEvent): string {
  const frame = (event.data as { frame?: unknown } | undefined)?.frame;
  if (typeof frame !== "string") return JSON.stringify(event);
  return JSON.stringify({
    ...event,
    data: { ...(event.data as object), frame: `<${frame.length} chars>` },
  });
}

export function formatEventLog(events: readonly TestEvent[]): string {
  return events.length === 0 ? "(no events received)" : events.map(forLog).join("\n");
}

/**
 * Wrap a failure with the context needed to debug it, keeping the original as
 * `cause`. The child process is gone by the time a human reads this, so anything
 * absent here is unrecoverable.
 */
export function describeChildFailure(error: Error, snapshot: ChildDiagnosticSnapshot): Error {
  return new Error(
    [
      error.message,
      "",
      `root: ${snapshot.root}`,
      `command: ${snapshot.command.map((part) => JSON.stringify(part)).join(" ")}`,
      `exit: ${snapshot.exit === undefined ? "running" : JSON.stringify(snapshot.exit)}`,
      `event channel failure: ${
        snapshot.eventChannelFailure === undefined
          ? "none"
          : (snapshot.eventChannelFailure.stack ?? snapshot.eventChannelFailure.message)
      }`,
      "event log:",
      formatEventLog(snapshot.events),
      "screen:",
      snapshot.screen,
      `PTY output tail: ${JSON.stringify(snapshot.output.slice(-OUTPUT_TAIL_BYTES))}`,
    ].join("\n"),
    { cause: error },
  );
}
