import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";

const MAX_RECENT_UPDATE_DECISIONS = 128;
const MAX_RECENT_SOURCE_STATES = 1_024;

interface WatcherUpdate {
  readonly type: string;
  readonly file: string;
  readonly timestamp: number;
}

interface UpdateDecision {
  readonly file: string;
  readonly duplicate: boolean;
}

export interface WatcherUpdateTracker {
  observe(update: WatcherUpdate): boolean;
  isDuplicate(timestamp: number | undefined): boolean;
}

function statIdentity(file: string): string {
  const stat = statSync(file, { bigint: true });
  return [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join(":");
}

function sourceStateIdentity(file: string): string | undefined {
  try {
    const before = statIdentity(file);
    const contents = readFileSync(file);
    const after = statIdentity(file);
    if (before !== after) return undefined;
    return `${after}:${createHash("sha256").update(contents).digest("base64url")}`;
  } catch {
    // A create/delete race or an unstable read must fail open. An extra update
    // is safer than hiding one whose source state cannot be proven.
    return undefined;
  }
}

function setRecent<Key, Value>(map: Map<Key, Value>, key: Key, value: Value, limit: number): void {
  map.delete(key);
  map.set(key, value);
  while (map.size > limit) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) return;
    map.delete(oldest);
  }
}

/**
 * Classifies Vite watcher tasks before compiler hooks run.
 *
 * Vite gives every handleHMRUpdate a strictly monotonic timestamp and reuses it
 * for each environment. Decisions are therefore immutable per timestamp: a
 * later task may reach its client hook before an earlier task reaches SSR, and
 * it must not overwrite what the earlier task decided. Both maps are bounded;
 * an evicted or unreadable observation fails open when queried.
 */
export function createWatcherUpdateTracker(): WatcherUpdateTracker {
  const sourceStates = new Map<string, string>();
  const decisions = new Map<number, UpdateDecision>();
  let highestFirstSeenTimestamp = Number.NEGATIVE_INFINITY;

  return {
    observe(update) {
      if (update.type !== "update") return false;

      const existing = decisions.get(update.timestamp);
      if (existing !== undefined) {
        // Timestamps are process-wide unique in the supported Vite version. If
        // that contract changes, a collision must fail open instead of applying
        // another file's decision.
        if (existing.file !== update.file) {
          decisions.set(update.timestamp, { file: "", duplicate: false });
          return false;
        }
        return existing.duplicate;
      }

      // A missing timestamp at or below the high-water mark was either evicted
      // or arrived late after another environment skipped this pre hook. Never
      // reclassify it against a newer source state: doing so could turn the one
      // legitimate task into a duplicate when its SSR phase finally catches up.
      if (update.timestamp <= highestFirstSeenTimestamp) return false;
      highestFirstSeenTimestamp = update.timestamp;

      const sourceState = sourceStateIdentity(update.file);
      let duplicate = false;
      if (sourceState === undefined) {
        sourceStates.delete(update.file);
      } else {
        duplicate = sourceStates.get(update.file) === sourceState;
        setRecent(sourceStates, update.file, sourceState, MAX_RECENT_SOURCE_STATES);
      }

      setRecent(
        decisions,
        update.timestamp,
        { file: update.file, duplicate },
        MAX_RECENT_UPDATE_DECISIONS,
      );
      return duplicate;
    },
    isDuplicate(timestamp) {
      return timestamp !== undefined && decisions.get(timestamp)?.duplicate === true;
    },
  };
}
