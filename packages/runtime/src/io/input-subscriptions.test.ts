import { describe, expect, test } from "vite-plus/test";
import { normalizeInputEvent } from "./normalized-input.ts";
import {
  createInternalInputSubscriptions,
  type InternalInputDemandLease,
} from "./input-subscriptions.ts";

const fact = normalizeInputEvent("a")!;

describe("input subscriptions", () => {
  test("broadcasts one captured fact to every subscriber in registration order", () => {
    const calls: string[] = [];
    const subscriptions = createInternalInputSubscriptions();
    subscriptions.subscribe(() => calls.push("first"));
    subscriptions.subscribe(() => calls.push("second"));

    for (const subscriber of subscriptions.capture()) subscriber(fact);

    expect(calls).toEqual(["first", "second"]);
  });

  test("a captured subscriber remains eligible for that fact after ending", () => {
    const calls: string[] = [];
    const subscriptions = createInternalInputSubscriptions();
    const first = subscriptions.subscribe(() => calls.push("first"));
    subscriptions.subscribe(() => calls.push("second"));
    const captured = subscriptions.capture();

    first.end();
    for (const subscriber of captured) subscriber(fact);

    expect(calls).toEqual(["first", "second"]);
    expect(subscriptions.capture()).toHaveLength(1);
  });

  test("acquires before publication and releases exactly once", () => {
    const transitions: string[] = [];
    const demands: InternalInputDemandLease[] = [];
    const subscriptions = createInternalInputSubscriptions({
      acquire() {
        transitions.push("acquire");
        const demand = {
          activate: () => transitions.push("activate"),
          release: () => transitions.push("release"),
        };
        demands.push(demand);
        return demand;
      },
    });

    const registration = subscriptions.subscribe(() => {});
    expect(transitions).toEqual(["acquire", "activate"]);
    expect(subscriptions.capture()).toHaveLength(1);

    registration.end();
    registration.end();
    expect(transitions).toEqual(["acquire", "activate", "release"]);
    expect(demands).toHaveLength(1);
  });

  test("keeps repeated subscriptions of the same function independent", () => {
    const calls: string[] = [];
    const transitions: string[] = [];
    let demandId = 0;
    const subscriptions = createInternalInputSubscriptions({
      acquire() {
        const id = ++demandId;
        return {
          activate: () => transitions.push(`activate:${id}`),
          release: () => transitions.push(`release:${id}`),
        };
      },
    });
    const subscriber = () => calls.push("called");

    const first = subscriptions.subscribe(subscriber);
    const second = subscriptions.subscribe(subscriber);
    for (const captured of subscriptions.capture()) captured(fact);
    expect(calls).toEqual(["called", "called"]);

    first.end();
    expect(subscriptions.capture()).toEqual([subscriber]);
    expect(transitions).toEqual(["activate:1", "activate:2", "release:1"]);

    second.end();
    expect(subscriptions.capture()).toEqual([]);
    expect(transitions).toEqual(["activate:1", "activate:2", "release:1", "release:2"]);
  });

  test("rolls back a failed activation and clears every surviving demand", () => {
    const transitions: string[] = [];
    let fail = true;
    const subscriptions = createInternalInputSubscriptions({
      acquire() {
        return {
          activate() {
            if (fail) {
              fail = false;
              throw new Error("activation failed");
            }
            transitions.push("activate");
          },
          release() {
            transitions.push("release");
          },
        };
      },
    });

    expect(() => subscriptions.subscribe(() => {})).toThrow("activation failed");
    expect(subscriptions.capture()).toEqual([]);
    expect(transitions).toEqual(["release"]);

    subscriptions.subscribe(() => {});
    subscriptions.subscribe(() => {});
    subscriptions.clear();
    subscriptions.clear();
    expect(transitions).toEqual(["release", "activate", "activate", "release", "release"]);
    expect(subscriptions.capture()).toEqual([]);
    expect(() => subscriptions.subscribe(() => {})).toThrow(/disposed/);
  });
});
