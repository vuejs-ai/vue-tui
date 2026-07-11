import { describe, expect, test, vi } from "vite-plus/test";
import {
  createManualSuspensionHost,
  createProcessSuspensionHost,
  type ProcessSuspensionAdapter,
} from "./process-suspension.ts";

type SuspensionSignal = "SIGTSTP" | "SIGCONT";

function createAdapter(platform: NodeJS.Platform = "linux") {
  const listeners = new Map<SuspensionSignal, Set<() => void>>();
  const addSignalListener = vi.fn((signal: SuspensionSignal, listener: () => void) => {
    let signalListeners = listeners.get(signal);
    if (!signalListeners) {
      signalListeners = new Set();
      listeners.set(signal, signalListeners);
    }
    signalListeners.add(listener);
  });
  const removeSignalListener = vi.fn((signal: SuspensionSignal, listener: () => void) => {
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
    emit(signal: SuspensionSignal) {
      for (const listener of listeners.get(signal) ?? []) listener();
    },
    listenerCount(signal: SuspensionSignal) {
      return listeners.get(signal)?.size ?? 0;
    },
  };
}

describe("createProcessSuspensionHost", () => {
  test("is unsupported on Windows and never installs signal listeners", () => {
    const processAdapter = createAdapter("win32");
    const manager = createProcessSuspensionHost(processAdapter.adapter);
    const suspend = vi.fn();
    const resume = vi.fn();

    const unregister = manager.register({ suspend, resume });
    processAdapter.emit("SIGTSTP");
    processAdapter.emit("SIGCONT");
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

  test("suspends and resumes every session in registration order once per cycle", () => {
    const processAdapter = createAdapter();
    const manager = createProcessSuspensionHost(processAdapter.adapter);
    const calls: string[] = [];
    const unregisterFirst = manager.register({
      suspend: () => calls.push("suspend:first"),
      resume: () => calls.push("resume:first"),
    });
    const unregisterSecond = manager.register({
      suspend: () => calls.push("suspend:second"),
      resume: () => calls.push("resume:second"),
    });

    processAdapter.emit("SIGTSTP");
    processAdapter.emit("SIGTSTP");
    expect(calls).toEqual(["suspend:first", "suspend:second"]);
    expect(processAdapter.stopCurrentProcess).toHaveBeenCalledTimes(1);

    processAdapter.emit("SIGCONT");
    processAdapter.emit("SIGCONT");
    expect(calls).toEqual(["suspend:first", "suspend:second", "resume:first", "resume:second"]);

    processAdapter.emit("SIGTSTP");
    processAdapter.emit("SIGCONT");
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

  test("continues after hook failures and ignores reentrant stop signals", () => {
    const processAdapter = createAdapter();
    const manager = createProcessSuspensionHost(processAdapter.adapter);
    const calls: string[] = [];
    const unregisterFirst = manager.register({
      suspend() {
        calls.push("suspend:first");
        processAdapter.emit("SIGTSTP");
        throw new Error("first suspend failed");
      },
      resume() {
        calls.push("resume:first");
        processAdapter.emit("SIGTSTP");
        throw new Error("first resume failed");
      },
    });
    const unregisterSecond = manager.register({
      suspend: () => calls.push("suspend:second"),
      resume: () => calls.push("resume:second"),
    });

    expect(() => processAdapter.emit("SIGTSTP")).not.toThrow();
    expect(processAdapter.stopCurrentProcess).toHaveBeenCalledTimes(1);
    expect(() => processAdapter.emit("SIGCONT")).not.toThrow();
    expect(calls).toEqual(["suspend:first", "suspend:second", "resume:first", "resume:second"]);

    unregisterFirst();
    unregisterSecond();
  });

  test("does not resume a session unregistered while the process is suspended", () => {
    const processAdapter = createAdapter();
    const manager = createProcessSuspensionHost(processAdapter.adapter);
    const firstResume = vi.fn();
    const secondResume = vi.fn();
    const unregisterFirst = manager.register({ suspend() {}, resume: firstResume });
    const unregisterSecond = manager.register({ suspend() {}, resume: secondResume });

    processAdapter.emit("SIGTSTP");
    unregisterFirst();
    processAdapter.emit("SIGCONT");

    expect(firstResume).not.toHaveBeenCalled();
    expect(secondResume).toHaveBeenCalledOnce();
    unregisterSecond();
  });

  test("still stops once when every session unregisters during suspension", () => {
    const processAdapter = createAdapter();
    const manager = createProcessSuspensionHost(processAdapter.adapter);
    let unregister = () => {};
    unregister = manager.register({
      suspend: () => unregister(),
      resume() {},
    });

    processAdapter.emit("SIGTSTP");

    expect(processAdapter.stopCurrentProcess).toHaveBeenCalledOnce();
    expect(processAdapter.listenerCount("SIGTSTP")).toBe(1);
    expect(processAdapter.listenerCount("SIGCONT")).toBe(1);

    processAdapter.emit("SIGCONT");
    expect(processAdapter.listenerCount("SIGTSTP")).toBe(0);
    expect(processAdapter.listenerCount("SIGCONT")).toBe(0);
  });

  test("restores sessions immediately when stopping the process fails", () => {
    const processAdapter = createAdapter();
    processAdapter.stopCurrentProcess.mockImplementation(() => {
      throw new Error("SIGSTOP failed");
    });
    const manager = createProcessSuspensionHost(processAdapter.adapter);
    const calls: string[] = [];
    const unregister = manager.register({
      suspend: () => calls.push("suspend"),
      resume: () => calls.push("resume"),
    });

    expect(() => processAdapter.emit("SIGTSTP")).not.toThrow();
    expect(calls).toEqual(["suspend", "resume"]);

    processAdapter.emit("SIGCONT");
    expect(calls).toEqual(["suspend", "resume"]);

    processAdapter.emit("SIGTSTP");
    expect(calls).toEqual(["suspend", "resume", "suspend", "resume"]);
    unregister();
  });

  test("handles a deterministic adapter that continues during the stop call", () => {
    const processAdapter = createAdapter();
    const manager = createProcessSuspensionHost(processAdapter.adapter);
    const calls: string[] = [];
    processAdapter.stopCurrentProcess.mockImplementation((afterContinue: () => void) => {
      calls.push("stop");
      afterContinue();
      processAdapter.emit("SIGCONT");
    });
    const unregister = manager.register({
      suspend: () => calls.push("suspend"),
      resume: () => calls.push("resume"),
    });

    processAdapter.emit("SIGTSTP");

    expect(calls).toEqual(["suspend", "stop", "resume"]);
    expect(processAdapter.stopCurrentProcess).toHaveBeenCalledOnce();
    unregister();
  });
});

describe("createManualSuspensionHost", () => {
  test("drives the same registration boundary without process signals", () => {
    const host = createManualSuspensionHost();
    const calls: string[] = [];
    const unregisterFirst = host.register({
      suspend: () => calls.push("suspend:first"),
      resume: () => calls.push("resume:first"),
    });
    const unregisterSecond = host.register({
      suspend: () => calls.push("suspend:second"),
      resume: () => calls.push("resume:second"),
    });

    host.suspend();
    host.suspend();
    host.resume();
    host.resume();

    expect(host.supported).toBe(true);
    expect(calls).toEqual(["suspend:first", "suspend:second", "resume:first", "resume:second"]);
    unregisterFirst();
    unregisterSecond();
  });

  test("can model an unsupported host", () => {
    const host = createManualSuspensionHost({ supported: false });
    const suspend = vi.fn();
    const resume = vi.fn();
    host.register({ suspend, resume });

    host.suspend();
    host.resume();

    expect(host.supported).toBe(false);
    expect(suspend).not.toHaveBeenCalled();
    expect(resume).not.toHaveBeenCalled();
  });
});
