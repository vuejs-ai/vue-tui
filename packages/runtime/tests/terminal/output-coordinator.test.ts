import { describe, expect, test, vi } from "vite-plus/test";
import type { TerminalBackend, TerminalOutput } from "../../src/terminal/backend.ts";
import {
  createTestTerminalBackend,
  type TestTerminalBackend,
} from "../../src/terminal/test/backend.ts";
import {
  createOutputCoordinator,
  type CoordinatedWriteResult,
} from "../../src/terminal/output-coordinator.ts";

function chunks(terminal: TestTerminalBackend, output: TerminalOutput = "stdout"): string[] {
  return terminal.writes.filter((write) => write.output === output).map((write) => write.data);
}

async function readyOf(result: CoordinatedWriteResult): Promise<void> {
  if (result.status === "blocked" || !result.writable) await result.ready;
}

describe("output coordinator", () => {
  test("captures the full body before an all-writable handoff", () => {
    const terminal = createTestTerminalBackend();
    const coordinator = createOutputCoordinator({ terminal });
    const observations: number[] = [];

    const result = coordinator.run(() => {
      coordinator.write("stdout", "a");
      observations.push(chunks(terminal).length);
      coordinator.write("stdout", "b");
      observations.push(chunks(terminal).length);
    });

    expect(result).toEqual({ status: "accepted", writable: true });
    expect(observations).toEqual([0, 0]);
    expect(chunks(terminal)).toEqual(["ab"]);
  });

  test("hands no bytes when transaction construction throws", () => {
    const failure = new Error("construction failed");
    const terminal = createTestTerminalBackend();
    const onUnhandedFailure = vi.fn();
    const coordinator = createOutputCoordinator({ terminal });

    expect(() =>
      coordinator.run(
        () => {
          coordinator.write("stdout", "captured");
          throw failure;
        },
        { onUnhandedFailure },
      ),
    ).toThrow(failure);
    expect(chunks(terminal)).toEqual([]);
    expect(onUnhandedFailure).toHaveBeenCalledWith(failure);
    expect(coordinator.isBlocked()).toBe(false);
  });

  test("combines one stdout transaction before handing it to the backend", async () => {
    const terminal = createTestTerminalBackend({ writeResults: { stdout: [false] } });
    const coordinator = createOutputCoordinator({ terminal });

    const result = coordinator.run(() => {
      coordinator.write("stdout", "a");
      coordinator.write("stdout", "b");
      coordinator.write("stdout", "c");
    });

    expect(result).toMatchObject({ status: "accepted", writable: false });
    expect(chunks(terminal)).toEqual(["abc"]);
    terminal.emitOutput("stdout", "drain");
    await readyOf(result);
  });

  test("blocks a public transaction that synchronously re-enters physical write", async () => {
    const nestedBody = vi.fn();
    let nestedResult: CoordinatedWriteResult | undefined;
    let coordinator!: ReturnType<typeof createOutputCoordinator>;
    const terminal = createTestTerminalBackend({
      onWrite() {
        nestedResult = coordinator.run(nestedBody);
      },
    });
    coordinator = createOutputCoordinator({ terminal });

    const outer = coordinator.run(() => coordinator.write("stdout", "outer"));

    expect(outer).toEqual({ status: "accepted", writable: true });
    expect(nestedResult?.status).toBe("blocked");
    expect(nestedBody).not.toHaveBeenCalled();
    if (nestedResult) await readyOf(nestedResult);
  });

  test("does not retain a later public transaction while backpressured", async () => {
    const terminal = createTestTerminalBackend({ writeResults: { stdout: [false] } });
    const coordinator = createOutputCoordinator({ terminal });
    coordinator.run(() => coordinator.write("stdout", "accepted"));
    const body = vi.fn();

    const result = coordinator.run(body);

    expect(result.status).toBe("blocked");
    expect(body).not.toHaveBeenCalled();
    expect(chunks(terminal)).toEqual(["accepted"]);
    terminal.emitOutput("stdout", "drain");
    await readyOf(result);
  });

  test("preserves cross-output segments and stops at every false return", async () => {
    const terminal = createTestTerminalBackend({
      writeResults: { stdout: [false, true], stderr: [false] },
    });
    const coordinator = createOutputCoordinator({ terminal });
    const result = coordinator.run(() => {
      coordinator.write("stdout", "a");
      coordinator.write("stderr", "b");
      coordinator.write("stdout", "c");
    });

    expect(chunks(terminal)).toEqual(["a"]);
    expect(chunks(terminal, "stderr")).toEqual([]);
    terminal.emitOutput("stdout", "drain");
    expect(chunks(terminal, "stderr")).toEqual(["b"]);
    expect(chunks(terminal)).toEqual(["a"]);
    terminal.emitOutput("stderr", "drain");
    expect(chunks(terminal)).toEqual(["a", "c"]);
    await readyOf(result);
  });

  test("rejects readiness and reports a deferred unhanded failure", async () => {
    const failure = new Error("deferred failure");
    const terminal = createTestTerminalBackend({
      writeResults: { stdout: [false], stderr: [failure] },
    });
    const onDeferredError = vi.fn();
    const onUnhandedFailure = vi.fn();
    const coordinator = createOutputCoordinator({ terminal, onDeferredError });
    const result = coordinator.run(
      () => {
        coordinator.write("stdout", "a");
        coordinator.write("stderr", "b");
      },
      { onUnhandedFailure },
    );

    terminal.emitOutput("stdout", "drain");

    await expect(readyOf(result)).rejects.toBe(failure);
    expect(onUnhandedFailure).toHaveBeenCalledWith(failure);
    expect(onDeferredError).toHaveBeenCalledWith(failure);
  });

  test("reports a synchronous physical write failure without retaining the gate", () => {
    const failure = new Error("write failed");
    const terminal = createTestTerminalBackend({ writeResults: { stdout: [failure] } });
    const onUnhandedFailure = vi.fn();
    const coordinator = createOutputCoordinator({ terminal });

    expect(() =>
      coordinator.run(() => coordinator.write("stdout", "a"), { onUnhandedFailure }),
    ).toThrow(failure);
    expect(onUnhandedFailure).toHaveBeenCalledWith(failure);
    expect(coordinator.isBlocked()).toBe(false);
  });

  test("marks only the segment whose physical write starts", () => {
    const failure = new Error("first write failed");
    const terminal = createTestTerminalBackend({ writeResults: { stdout: [failure] } });
    const coordinator = createOutputCoordinator({ terminal });
    const attempts: string[] = [];

    expect(() =>
      coordinator.run(() => {
        coordinator.write("stdout", "a", undefined, undefined, () => attempts.push("a"));
        coordinator.write("stdout", "b", undefined, undefined, () => attempts.push("b"));
      }),
    ).toThrow(failure);

    expect(chunks(terminal)).toEqual(["a"]);
    expect(attempts).toEqual(["a"]);
  });

  test("settles and releases drain listeners when a blocked output closes", async () => {
    const terminal = createTestTerminalBackend({ writeResults: { stdout: [false] } });
    const onDeferredError = vi.fn();
    const coordinator = createOutputCoordinator({ terminal, onDeferredError });
    const result = coordinator.run(() => coordinator.write("stdout", "a"));

    terminal.emitOutput("stdout", "close");

    await expect(readyOf(result)).rejects.toThrow("closed before drain");
    expect(onDeferredError).toHaveBeenCalledOnce();
    expect(coordinator.isBlocked()).toBe(false);
  });

  test("settles and releases drain listeners when a blocked output finishes", async () => {
    const terminal = createTestTerminalBackend({ writeResults: { stdout: [false] } });
    const onDeferredError = vi.fn();
    const coordinator = createOutputCoordinator({ terminal, onDeferredError });
    const result = coordinator.run(() => coordinator.write("stdout", "a"));

    terminal.emitOutput("stdout", "finish");

    await expect(readyOf(result)).rejects.toThrow("ended before drain");
    expect(onDeferredError).toHaveBeenCalledOnce();
    expect(coordinator.isBlocked()).toBe(false);
  });

  test("settles and releases drain listeners when a blocked output errors", async () => {
    const failure = new Error("stream failed");
    const terminal = createTestTerminalBackend({ writeResults: { stdout: [false] } });
    const onDeferredError = vi.fn();
    const coordinator = createOutputCoordinator({ terminal, onDeferredError });
    const result = coordinator.run(() => coordinator.write("stdout", "a"));

    terminal.emitOutput("stdout", "error", failure);

    await expect(readyOf(result)).rejects.toBe(failure);
    expect(onDeferredError).toHaveBeenCalledWith(failure);
  });

  test("aborts an accepted remainder and permits a fresh transaction", async () => {
    const terminal = createTestTerminalBackend({
      writeResults: { stdout: [false], stderr: [true] },
    });
    const coordinator = createOutputCoordinator({ terminal });
    const result = coordinator.run(() => {
      coordinator.write("stdout", "a");
      coordinator.write("stderr", "b");
    });
    const failure = new Error("suspended");

    coordinator.abort(failure);

    await expect(readyOf(result)).rejects.toBe(failure);
    expect(chunks(terminal, "stderr")).toEqual([]);
    expect(coordinator.run(() => coordinator.write("stderr", "fresh"))).toEqual({
      status: "accepted",
      writable: true,
    });
    expect(chunks(terminal, "stderr")).toEqual(["fresh"]);
  });

  test("abort still clears the gate when backend listener removal throws", async () => {
    const base = createTestTerminalBackend({ writeResults: { stdout: [false] } });
    const terminal: TerminalBackend = {
      ...base,
      onOutputEvent(output, event, listener) {
        const remove = base.onOutputEvent(output, event, listener);
        return () => {
          remove();
          throw new Error("hostile listener removal");
        };
      },
    };
    const coordinator = createOutputCoordinator({ terminal });
    const result = coordinator.run(() => coordinator.write("stdout", "blocked"));
    const failure = new Error("reload abandoned output");

    expect(() => coordinator.abort(failure)).not.toThrow();
    await expect(readyOf(result)).rejects.toBe(failure);
    expect(coordinator.isBlocked()).toBe(false);
  });

  test("stops handoff when a physical write synchronously aborts the transaction", () => {
    const chunksWritten: string[] = [];
    let coordinator!: ReturnType<typeof createOutputCoordinator>;
    const failure = new Error("interrupted");
    const terminal = createTestTerminalBackend({
      onWrite(output, data) {
        if (output !== "stdout") return;
        chunksWritten.push(data);
        coordinator.abort(failure);
      },
    });
    coordinator = createOutputCoordinator({ terminal });

    expect(() =>
      coordinator.run(() => {
        coordinator.write("stdout", "a");
        coordinator.write("stderr", "b");
      }),
    ).toThrow(failure);
    expect(chunksWritten).toEqual(["a"]);
    expect(chunks(terminal, "stderr")).toEqual([]);
    expect(coordinator.isBlocked()).toBe(false);
  });
});
