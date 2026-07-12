import { describe, expect, test, vi } from "vite-plus/test";
import {
  createManualSuspensionHost,
  createProcessSuspensionHost,
  type ProcessSuspensionAdapter,
} from "./process-suspension.ts";

type SuspensionSignal = "SIGTSTP" | "SIGCONT";
type SuspensionListener = () => void | Promise<void>;

function createAdapter(platform: NodeJS.Platform = "linux") {
  const listeners = new Map<SuspensionSignal, Set<SuspensionListener>>();
  const addSignalListener = vi.fn((signal: SuspensionSignal, listener: SuspensionListener) => {
    let signalListeners = listeners.get(signal);
    if (!signalListeners) {
      signalListeners = new Set();
      listeners.set(signal, signalListeners);
    }
    signalListeners.add(listener);
  });
  const removeSignalListener = vi.fn((signal: SuspensionSignal, listener: SuspensionListener) => {
    listeners.get(signal)?.delete(listener);
  });
  const stopCurrentProcess = vi.fn();
  const adapter: ProcessSuspensionAdapter = {
    platform,
    addSignalListener,
    removeSignalListener,
    stopCurrentProcess,
  };

  return {
    adapter,
    addSignalListener,
    removeSignalListener,
    stopCurrentProcess,
    async emit(signal: SuspensionSignal) {
      const pending: Promise<void>[] = [];
      for (const listener of listeners.get(signal) ?? []) {
        const result = listener();
        if (result) pending.push(Promise.resolve(result));
      }
      await Promise.allSettled(pending);
    },
    listenerCount(signal: SuspensionSignal) {
      return listeners.get(signal)?.size ?? 0;
    },
  };
}

describe("createProcessSuspensionHost", () => {
  test("is unsupported on Windows and never installs signal listeners", async () => {
    const processAdapter = createAdapter("win32");
    const manager = createProcessSuspensionHost(processAdapter.adapter);
    const suspend = vi.fn();
    const resume = vi.fn();

    const unregister = manager.register({ suspend, resume });
    await processAdapter.emit("SIGTSTP");
    await processAdapter.emit("SIGCONT");
    unregister();
    unregister();

    expect(manager.supported).toBe(false);
    expect(processAdapter.addSignalListener).not.toHaveBeenCalled();
    expect(processAdapter.removeSignalListener).not.toHaveBeenCalled();
    expect(processAdapter.stopCurrentProcess).not.toHaveBeenCalled();
    expect(suspend).not.toHaveBeenCalled();
    expect(resume).not.toHaveBeenCalled();
  });

  test("shares lazy listeners and removes them after the last registration", () => {
    const processAdapter = createAdapter();
    const manager = createProcessSuspensionHost(processAdapter.adapter);
    const unregisterFirst = manager.register({ suspend() {}, resume() {} });
    const unregisterSecond = manager.register({ suspend() {}, resume() {} });

    expect(manager.supported).toBe(true);
    expect(processAdapter.addSignalListener).toHaveBeenCalledTimes(2);
    expect(processAdapter.listenerCount("SIGTSTP")).toBe(1);
    expect(processAdapter.listenerCount("SIGCONT")).toBe(1);

    unregisterFirst();
    unregisterFirst();
    expect(processAdapter.removeSignalListener).not.toHaveBeenCalled();

    unregisterSecond();
    unregisterSecond();
    expect(processAdapter.removeSignalListener).toHaveBeenCalledTimes(2);
    expect(processAdapter.listenerCount("SIGTSTP")).toBe(0);
    expect(processAdapter.listenerCount("SIGCONT")).toBe(0);
  });

  test("suspends and resumes every session in registration order once per cycle", async () => {
    const processAdapter = createAdapter();
    const manager = createProcessSuspensionHost(processAdapter.adapter);
    const calls: string[] = [];
    const unregisterFirst = manager.register({
      suspend: () => calls.push("suspend:first"),
      resume: () => {
        calls.push("resume:first");
      },
    });
    const unregisterSecond = manager.register({
      suspend: () => calls.push("suspend:second"),
      resume: () => {
        calls.push("resume:second");
      },
    });

    await processAdapter.emit("SIGTSTP");
    await processAdapter.emit("SIGTSTP");
    expect(calls).toEqual(["suspend:first", "suspend:second"]);
    expect(processAdapter.stopCurrentProcess).toHaveBeenCalledTimes(1);

    await processAdapter.emit("SIGCONT");
    await processAdapter.emit("SIGCONT");
    expect(calls).toEqual(["suspend:first", "suspend:second", "resume:first", "resume:second"]);

    await processAdapter.emit("SIGTSTP");
    await processAdapter.emit("SIGCONT");
    expect(processAdapter.stopCurrentProcess).toHaveBeenCalledTimes(2);
    expect(calls.slice(-4)).toEqual([
      "suspend:first",
      "suspend:second",
      "resume:first",
      "resume:second",
    ]);

    unregisterFirst();
    unregisterSecond();
  });

  test("continues after hook failures and ignores reentrant stop signals", async () => {
    const processAdapter = createAdapter();
    const manager = createProcessSuspensionHost(processAdapter.adapter);
    const calls: string[] = [];
    const unregisterFirst = manager.register({
      suspend() {
        calls.push("suspend:first");
        void processAdapter.emit("SIGTSTP");
        throw new Error("first suspend failed");
      },
      resume() {
        calls.push("resume:first");
        void processAdapter.emit("SIGTSTP");
        throw new Error("first resume failed");
      },
    });
    const unregisterSecond = manager.register({
      suspend: () => calls.push("suspend:second"),
      resume: () => {
        calls.push("resume:second");
      },
    });

    await expect(processAdapter.emit("SIGTSTP")).resolves.toBeUndefined();
    expect(processAdapter.stopCurrentProcess).toHaveBeenCalledTimes(1);
    await expect(processAdapter.emit("SIGCONT")).resolves.toBeUndefined();
    expect(calls).toEqual(["suspend:first", "suspend:second", "resume:first", "resume:second"]);

    unregisterFirst();
    unregisterSecond();
  });

  test("does not resume a session unregistered while the process is suspended", async () => {
    const processAdapter = createAdapter();
    const manager = createProcessSuspensionHost(processAdapter.adapter);
    const firstResume = vi.fn();
    const secondResume = vi.fn();
    const unregisterFirst = manager.register({ suspend() {}, resume: firstResume });
    const unregisterSecond = manager.register({ suspend() {}, resume: secondResume });

    await processAdapter.emit("SIGTSTP");
    unregisterFirst();
    await processAdapter.emit("SIGCONT");

    expect(firstResume).not.toHaveBeenCalled();
    expect(secondResume).toHaveBeenCalledOnce();
    unregisterSecond();
  });

  test("still stops once when every session unregisters during suspension", async () => {
    const processAdapter = createAdapter();
    const manager = createProcessSuspensionHost(processAdapter.adapter);
    let unregister = () => {};
    unregister = manager.register({
      suspend: () => unregister(),
      resume() {},
    });

    await processAdapter.emit("SIGTSTP");

    expect(processAdapter.stopCurrentProcess).toHaveBeenCalledOnce();
    expect(processAdapter.listenerCount("SIGTSTP")).toBe(1);
    expect(processAdapter.listenerCount("SIGCONT")).toBe(1);

    await processAdapter.emit("SIGCONT");
    expect(processAdapter.listenerCount("SIGTSTP")).toBe(0);
    expect(processAdapter.listenerCount("SIGCONT")).toBe(0);
  });

  test("restores sessions immediately when stopping the process fails", async () => {
    const processAdapter = createAdapter();
    processAdapter.stopCurrentProcess.mockImplementation(() => {
      throw new Error("SIGSTOP failed");
    });
    const manager = createProcessSuspensionHost(processAdapter.adapter);
    const calls: string[] = [];
    const unregister = manager.register({
      suspend: () => calls.push("suspend"),
      resume: () => {
        calls.push("resume");
      },
    });

    await expect(processAdapter.emit("SIGTSTP")).resolves.toBeUndefined();
    expect(calls).toEqual(["suspend", "resume"]);

    await processAdapter.emit("SIGCONT");
    expect(calls).toEqual(["suspend", "resume"]);

    await processAdapter.emit("SIGTSTP");
    expect(calls).toEqual(["suspend", "resume", "suspend", "resume"]);
    unregister();
  });

  test("handles a deterministic adapter that continues during the stop call", async () => {
    const processAdapter = createAdapter();
    const manager = createProcessSuspensionHost(processAdapter.adapter);
    const calls: string[] = [];
    processAdapter.stopCurrentProcess.mockImplementation((afterContinue: () => void) => {
      calls.push("stop");
      afterContinue();
      void processAdapter.emit("SIGCONT");
    });
    const unregister = manager.register({
      suspend: () => calls.push("suspend"),
      resume: () => {
        calls.push("resume");
      },
    });

    await processAdapter.emit("SIGTSTP");

    expect(calls).toEqual(["suspend", "stop", "resume"]);
    expect(processAdapter.stopCurrentProcess).toHaveBeenCalledOnce();
    unregister();
  });

  test("keeps a continuation cycle closed until every asynchronous resume settles", async () => {
    const processAdapter = createAdapter();
    const manager = createProcessSuspensionHost(processAdapter.adapter);
    let settleResume!: () => void;
    const resume = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          settleResume = resolve;
        }),
    );
    const unregister = manager.register({ suspend() {}, resume });

    await processAdapter.emit("SIGTSTP");
    const continuation = processAdapter.emit("SIGCONT");
    await Promise.resolve();
    expect(resume).toHaveBeenCalledOnce();

    await processAdapter.emit("SIGTSTP");
    expect(processAdapter.stopCurrentProcess).toHaveBeenCalledOnce();

    settleResume();
    await continuation;
    await processAdapter.emit("SIGTSTP");
    expect(processAdapter.stopCurrentProcess).toHaveBeenCalledTimes(2);
    const secondContinuation = processAdapter.emit("SIGCONT");
    await Promise.resolve();
    settleResume();
    await secondContinuation;
    unregister();
  });
});

describe("createManualSuspensionHost", () => {
  test("drives the same registration boundary without process signals", async () => {
    const host = createManualSuspensionHost();
    const calls: string[] = [];
    const unregisterFirst = host.register({
      suspend: () => calls.push("suspend:first"),
      resume: () => {
        calls.push("resume:first");
      },
    });
    const unregisterSecond = host.register({
      suspend: () => calls.push("suspend:second"),
      resume: () => {
        calls.push("resume:second");
      },
    });

    await host.suspend();
    await host.suspend();
    await host.resume();
    await host.resume();

    expect(host.supported).toBe(true);
    expect(calls).toEqual(["suspend:first", "suspend:second", "resume:first", "resume:second"]);
    unregisterFirst();
    unregisterSecond();
  });

  test("can model an unsupported host", async () => {
    const host = createManualSuspensionHost({ supported: false });
    const suspend = vi.fn();
    const resume = vi.fn();
    host.register({ suspend, resume });

    await host.suspend();
    await host.resume();

    expect(host.supported).toBe(false);
    expect(suspend).not.toHaveBeenCalled();
    expect(resume).not.toHaveBeenCalled();
  });
});
