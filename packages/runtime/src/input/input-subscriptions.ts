import type { InputEvent } from "./normalized-input.ts";

export type InternalInputSubscriber = (fact: InputEvent) => void;

export interface InternalInputDemandLease {
  /** Publish a demand whose physical terminal resources were already acquired. */
  activate(): void;
  /** Stop delivery immediately and release physical resources safely. */
  release(): void;
}

export interface InternalInputSubscription {
  end(): void;
}

export interface InputDispatcher {
  subscribe(subscriber: InternalInputSubscriber): InternalInputSubscription;
  /** Capture the subscribers eligible when one parser-defined input fact begins. */
  capture(): readonly InternalInputSubscriber[];
  /**
   * Deliver one fact to the subscribers `capture()` returned when that fact began,
   * not to whoever is subscribed now. Every captured subscriber runs even if one
   * throws or clears the dispatcher; the first error is rethrown after delivery.
   */
  deliver(fact: InputEvent, subscribers: readonly InternalInputSubscriber[]): void;
  clear(): void;
}

export interface InternalInputDemandHost {
  acquire(): InternalInputDemandLease;
}

/**
 * Private broadcast registry for public `useInput()` subscriptions.
 *
 * Runtime owns normalized input framing and terminal input modes. It does not
 * assign focus, propagation, default-action, or external-forwarding policy to
 * these subscriptions.
 */
export function createInputDispatcher(demandHost?: InternalInputDemandHost): InputDispatcher {
  interface SubscriptionRecord {
    readonly subscriber: InternalInputSubscriber;
    readonly demand: InternalInputDemandLease | undefined;
  }

  const records = new Set<SubscriptionRecord>();
  let cleared = false;

  const releaseSafely = (demand: InternalInputDemandLease | undefined): void => {
    try {
      demand?.release();
    } catch {
      // Input release is terminal cleanup. One hostile host release must not
      // prevent the registry from dropping the remaining subscriptions.
    }
  };

  return {
    subscribe(subscriber) {
      if (cleared) throw new Error("Cannot subscribe after the input host has been disposed");

      const demand = demandHost?.acquire();
      if (cleared) {
        releaseSafely(demand);
        return Object.freeze({ end() {} });
      }

      const record: SubscriptionRecord = { subscriber, demand };
      records.add(record);
      try {
        demand?.activate();
      } catch (error) {
        records.delete(record);
        releaseSafely(demand);
        throw error;
      }

      let active = true;
      return Object.freeze({
        end() {
          if (!active) return;
          active = false;
          records.delete(record);
          releaseSafely(record.demand);
        },
      });
    },
    capture() {
      return Object.freeze([...records].map(({ subscriber }) => subscriber));
    },
    deliver(fact, subscribers) {
      let firstError: unknown;
      let failed = false;
      for (const subscriber of subscribers) {
        try {
          subscriber(fact);
        } catch (error) {
          if (failed) continue;
          failed = true;
          firstError = error;
        }
      }
      if (failed) throw firstError;
    },
    clear() {
      if (cleared) return;
      cleared = true;
      const activeRecords = [...records];
      records.clear();
      for (const record of activeRecords) releaseSafely(record.demand);
    },
  };
}
