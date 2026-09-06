import { expect, test, vi } from "vite-plus/test";
import type { TerminalBackend } from "../../src/terminal/backend.ts";
import { createTestTerminalBackend } from "../../src/terminal/test/backend.ts";
import { createMountedStreamLifecycle } from "../../src/terminal/stream-lifecycle.ts";

test("shared terminal observers fan a failed stderr write out to every mounted app", () => {
  const terminal = createTestTerminalBackend();
  const failures = Array.from({ length: 12 }, () => vi.fn());
  const lifecycles = failures.map((onFailure) => {
    const lifecycle = createMountedStreamLifecycle({
      terminal,
      hasManagedInputDemand: () => false,
      onFailure,
    });
    lifecycle.activate();
    return lifecycle;
  });

  for (const lifecycle of lifecycles) lifecycle.trackWrite("stderr");
  const failure = new Error("shared stderr failed");
  terminal.emitOutput("stderr", "error", failure);

  for (const onFailure of failures) expect(onFailure).toHaveBeenCalledWith(failure);

  const first = failures[0]!;
  lifecycles[0]!.dispose();
  terminal.emitOutput("stderr", "error", new Error("after dispose"));
  expect(first).toHaveBeenCalledTimes(1);
  for (const lifecycle of lifecycles.slice(1)) lifecycle.dispose();
});

test("a shared stdout and stderr destination reports one failed write once", () => {
  const base = createTestTerminalBackend();
  const terminal: TerminalBackend = {
    ...base,
    outputOwnerFor: () => base.outputOwnerFor("stdout"),
  };
  const onFailure = vi.fn();
  const lifecycle = createMountedStreamLifecycle({
    terminal,
    hasManagedInputDemand: () => false,
    onFailure,
  });
  lifecycle.activate();
  lifecycle.trackWrite("stderr");

  const failure = new Error("shared output failed");
  base.emitOutput("stdout", "error", failure);

  expect(onFailure).toHaveBeenCalledTimes(1);
  expect(onFailure).toHaveBeenCalledWith(failure);
  lifecycle.dispose();
});

test("input errors matter only while the app has managed input demand", () => {
  const terminal = createTestTerminalBackend();
  const onFailure = vi.fn();
  let hasManagedInputDemand = false;
  const lifecycle = createMountedStreamLifecycle({
    terminal,
    hasManagedInputDemand: () => hasManagedInputDemand,
    onFailure,
  });
  lifecycle.activate();

  terminal.emitInput("error", new Error("idle input"));
  expect(onFailure).not.toHaveBeenCalled();

  hasManagedInputDemand = true;
  const failure = new Error("managed input failed");
  terminal.emitInput("error", failure);
  expect(onFailure).toHaveBeenCalledWith(failure);
  lifecycle.dispose();
});

test("hostile listener cleanup still forgets the observer broker", () => {
  const base = createTestTerminalBackend();
  let removalFailed = false;
  const cleanupFailure = new Error("output listener removal failed");
  const terminal: TerminalBackend = {
    ...base,
    onOutputEvent(output, event, listener) {
      const remove = base.onOutputEvent(output, event, listener);
      return () => {
        remove();
        if (!removalFailed) {
          removalFailed = true;
          throw cleanupFailure;
        }
      };
    },
  };
  const lifecycle = createMountedStreamLifecycle({
    terminal,
    hasManagedInputDemand: () => false,
    onFailure: vi.fn(),
  });
  lifecycle.activate();

  expect(() => lifecycle.dispose()).toThrow(cleanupFailure);

  const next = createMountedStreamLifecycle({
    terminal,
    hasManagedInputDemand: () => false,
    onFailure: vi.fn(),
  });
  next.activate();
  next.dispose();
});
