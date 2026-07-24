import { EventEmitter } from "node:events";
import { describe, expect, test, vi } from "vite-plus/test";
import { runtimeResourceTracker } from "../resource-tracker.ts";
import { createOutputCoordinator, type CoordinatedWriteResult } from "./output-coordinator.ts";

function createWritable(results: readonly (boolean | Error)[]) {
  const events = new EventEmitter();
  const chunks: string[] = [];
  let index = 0;
  const stream = Object.assign(events, {
    write(data: string, callback?: () => void): boolean {
      const result = results[index++] ?? true;
      chunks.push(data);
      if (result instanceof Error) throw result;
      callback?.();
      return result;
    },
  }) as unknown as NodeJS.WriteStream;
  return { stream, chunks, events };
}

async function readyOf(result: CoordinatedWriteResult): Promise<void> {
  if (result.status === "blocked" || !result.writable) await result.ready;
}

describe("output coordinator", () => {
  test("captures the full body before an all-writable handoff", () => {
    const { stream, chunks } = createWritable([true]);
    const coordinator = createOutputCoordinator();
    const observations: number[] = [];

    const result = coordinator.run(() => {
      coordinator.write(stream, "a");
      observations.push(chunks.length);
      coordinator.write(stream, "b");
      observations.push(chunks.length);
    });

    expect(result).toEqual({ status: "accepted", writable: true });
    expect(observations).toEqual([0, 0]);
    expect(chunks).toEqual(["ab"]);
  });

  test("hands no bytes when transaction construction throws", () => {
    const failure = new Error("construction failed");
    const { stream, chunks } = createWritable([true]);
    const onUnhandedFailure = vi.fn();
    const coordinator = createOutputCoordinator();

    expect(() =>
      coordinator.run(
        () => {
          coordinator.write(stream, "captured");
          throw failure;
        },
        { onUnhandedFailure },
      ),
    ).toThrow(failure);
    expect(chunks).toEqual([]);
    expect(onUnhandedFailure).toHaveBeenCalledWith(failure);
    expect(coordinator.isBlocked()).toBe(false);
  });

  test("combines one stdout transaction before handing it to the stream", async () => {
    const listenerBaseline = runtimeResourceTracker.snapshot().streamListeners;
    const { stream, chunks, events } = createWritable([false]);
    const coordinator = createOutputCoordinator();

    const result = coordinator.run(() => {
      coordinator.write(stream, "a");
      coordinator.write(stream, "b");
      coordinator.write(stream, "c");
    });

    expect(result).toMatchObject({ status: "accepted", writable: false });
    expect(chunks).toEqual(["abc"]);
    expect(runtimeResourceTracker.snapshot().streamListeners).toBe(listenerBaseline + 4);
    events.emit("drain");
    await readyOf(result);
    expect(runtimeResourceTracker.snapshot().streamListeners).toBe(listenerBaseline);
  });

  test("blocks a public transaction that synchronously re-enters physical write", async () => {
    const events = new EventEmitter();
    const nestedBody = vi.fn();
    let nestedResult: CoordinatedWriteResult | undefined;
    const coordinator = createOutputCoordinator();
    const stream = Object.assign(events, {
      write(): boolean {
        nestedResult = coordinator.run(nestedBody);
        return true;
      },
    }) as unknown as NodeJS.WriteStream;

    const outer = coordinator.run(() => coordinator.write(stream, "outer"));

    expect(outer).toEqual({ status: "accepted", writable: true });
    expect(nestedResult?.status).toBe("blocked");
    expect(nestedBody).not.toHaveBeenCalled();
    if (nestedResult) await readyOf(nestedResult);
  });

  test("does not retain a later public transaction while backpressured", async () => {
    const { stream, chunks, events } = createWritable([false]);
    const coordinator = createOutputCoordinator();
    coordinator.run(() => coordinator.write(stream, "accepted"));
    const body = vi.fn();

    const result = coordinator.run(body);

    expect(result.status).toBe("blocked");
    expect(body).not.toHaveBeenCalled();
    expect(chunks).toEqual(["accepted"]);
    events.emit("drain");
    await readyOf(result);
  });

  test("preserves cross-stream segments and stops at every false return", async () => {
    const first = createWritable([false, true]);
    const second = createWritable([false]);
    const coordinator = createOutputCoordinator();
    const result = coordinator.run(() => {
      coordinator.write(first.stream, "a");
      coordinator.write(second.stream, "b");
      coordinator.write(first.stream, "c");
    });

    expect(first.chunks).toEqual(["a"]);
    expect(second.chunks).toEqual([]);
    first.events.emit("drain");
    expect(second.chunks).toEqual(["b"]);
    expect(first.chunks).toEqual(["a"]);
    second.events.emit("drain");
    expect(first.chunks).toEqual(["a", "c"]);
    await readyOf(result);
  });

  test("rejects readiness and reports a deferred unhanded failure", async () => {
    const failure = new Error("deferred failure");
    const first = createWritable([false]);
    const second = createWritable([failure]);
    const onDeferredError = vi.fn();
    const onUnhandedFailure = vi.fn();
    const coordinator = createOutputCoordinator({ onDeferredError });
    const result = coordinator.run(
      () => {
        coordinator.write(first.stream, "a");
        coordinator.write(second.stream, "b");
      },
      { onUnhandedFailure },
    );

    first.events.emit("drain");

    await expect(readyOf(result)).rejects.toBe(failure);
    expect(onUnhandedFailure).toHaveBeenCalledWith(failure);
    expect(onDeferredError).toHaveBeenCalledWith(failure);
  });

  test("reports a synchronous physical write failure without retaining the gate", () => {
    const failure = new Error("write failed");
    const { stream } = createWritable([failure]);
    const onUnhandedFailure = vi.fn();
    const coordinator = createOutputCoordinator();

    expect(() =>
      coordinator.run(() => coordinator.write(stream, "a"), { onUnhandedFailure }),
    ).toThrow(failure);
    expect(onUnhandedFailure).toHaveBeenCalledWith(failure);
    expect(coordinator.isBlocked()).toBe(false);
  });

  test("settles and releases drain listeners when a blocked stream closes", async () => {
    const listenerBaseline = runtimeResourceTracker.snapshot().streamListeners;
    const { stream, events } = createWritable([false]);
    const onDeferredError = vi.fn();
    const coordinator = createOutputCoordinator({ onDeferredError });
    const result = coordinator.run(() => coordinator.write(stream, "a"));

    events.emit("close");

    await expect(readyOf(result)).rejects.toThrow("closed before drain");
    expect(onDeferredError).toHaveBeenCalledOnce();
    expect(runtimeResourceTracker.snapshot().streamListeners).toBe(listenerBaseline);
    expect(coordinator.isBlocked()).toBe(false);
  });

  test("settles and releases drain listeners when a blocked stream finishes", async () => {
    const listenerBaseline = runtimeResourceTracker.snapshot().streamListeners;
    const { stream, events } = createWritable([false]);
    const onDeferredError = vi.fn();
    const coordinator = createOutputCoordinator({ onDeferredError });
    const result = coordinator.run(() => coordinator.write(stream, "a"));

    events.emit("finish");

    await expect(readyOf(result)).rejects.toThrow("ended before drain");
    expect(onDeferredError).toHaveBeenCalledOnce();
    expect(runtimeResourceTracker.snapshot().streamListeners).toBe(listenerBaseline);
    expect(coordinator.isBlocked()).toBe(false);
  });

  test("settles and releases drain listeners when a blocked stream errors", async () => {
    const listenerBaseline = runtimeResourceTracker.snapshot().streamListeners;
    const failure = new Error("stream failed");
    const { stream, events } = createWritable([false]);
    const onDeferredError = vi.fn();
    const coordinator = createOutputCoordinator({ onDeferredError });
    const result = coordinator.run(() => coordinator.write(stream, "a"));

    events.emit("error", failure);

    await expect(readyOf(result)).rejects.toBe(failure);
    expect(onDeferredError).toHaveBeenCalledWith(failure);
    expect(runtimeResourceTracker.snapshot().streamListeners).toBe(listenerBaseline);
  });

  test("aborts an accepted remainder and permits a fresh transaction", async () => {
    const listenerBaseline = runtimeResourceTracker.snapshot().streamListeners;
    const first = createWritable([false]);
    const second = createWritable([true]);
    const coordinator = createOutputCoordinator();
    const result = coordinator.run(() => {
      coordinator.write(first.stream, "a");
      coordinator.write(second.stream, "b");
    });
    const failure = new Error("suspended");

    coordinator.abort(failure);

    await expect(readyOf(result)).rejects.toBe(failure);
    expect(second.chunks).toEqual([]);
    expect(runtimeResourceTracker.snapshot().streamListeners).toBe(listenerBaseline);
    expect(coordinator.run(() => coordinator.write(second.stream, "fresh"))).toEqual({
      status: "accepted",
      writable: true,
    });
    expect(second.chunks).toEqual(["fresh"]);
  });

  test("abort still clears the gate when borrowed listener removal throws", async () => {
    const listenerBaseline = runtimeResourceTracker.snapshot().streamListeners;
    const { stream, events } = createWritable([false]);
    const coordinator = createOutputCoordinator();
    const result = coordinator.run(() => coordinator.write(stream, "blocked"));
    const failure = new Error("reload abandoned output");
    const originalOff = events.off.bind(events);
    events.off = ((event: string | symbol, listener: (...args: unknown[]) => void) => {
      originalOff(event, listener);
      throw new Error("hostile off");
    }) as typeof events.off;

    expect(() => coordinator.abort(failure)).not.toThrow();
    await expect(readyOf(result)).rejects.toBe(failure);
    expect(coordinator.isBlocked()).toBe(false);
    expect(runtimeResourceTracker.snapshot().streamListeners).toBe(listenerBaseline);
  });

  test("stops handoff when a physical write synchronously aborts the transaction", () => {
    const events = new EventEmitter();
    const chunks: string[] = [];
    const later = createWritable([true]);
    const coordinator = createOutputCoordinator();
    const failure = new Error("interrupted");
    const stream = Object.assign(events, {
      write(data: string): boolean {
        chunks.push(data);
        coordinator.abort(failure);
        return true;
      },
    }) as unknown as NodeJS.WriteStream;

    expect(() =>
      coordinator.run(() => {
        coordinator.write(stream, "a");
        coordinator.write(later.stream, "b");
      }),
    ).toThrow(failure);
    expect(chunks).toEqual(["a"]);
    expect(later.chunks).toEqual([]);
    expect(coordinator.isBlocked()).toBe(false);
  });
});
