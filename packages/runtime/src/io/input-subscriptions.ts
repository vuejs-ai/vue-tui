import type { NormalizedInputFact } from "./normalized-input.ts";

export type InternalInputSubscriber = (fact: NormalizedInputFact) => void;

export interface InternalInputDemandLease {
  /** Publish a demand whose physical terminal resources were already acquired. */
  activate(): void;
  /** Stop delivery immediately and release physical resources safely. */
  release(): void;
}

export interface InternalInputSubscription {
  end(): void;
}

export interface InternalInputSubscriptions {
  subscribe(subscriber: InternalInputSubscriber): InternalInputSubscription;
  /** Capture the subscribers eligible when one parser-defined input fact begins. */
  capture(): readonly InternalInputSubscriber[];
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
export function createInternalInputSubscriptions(
  demandHost?: InternalInputDemandHost,
): InternalInputSubscriptions {
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
    clear() {
      if (cleared) return;
      cleared = true;
      const activeRecords = [...records];
      records.clear();
      for (const record of activeRecords) releaseSafely(record.demand);
    },
  };
}
