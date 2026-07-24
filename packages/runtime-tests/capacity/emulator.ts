import { Worker } from "node:worker_threads";

export interface CapacityTerminalSnapshot {
  readonly activeBuffer: "normal" | "alternate";
  readonly lines: readonly string[];
  readonly scrollback: readonly string[];
  readonly cursor: { readonly visible: boolean };
}

interface EmulatorRequest {
  readonly id: number;
  readonly operation: "write" | "resize" | "snapshot" | "dispose";
  readonly data?: string | Uint8Array;
  readonly columns?: number;
  readonly rows?: number;
}

interface EmulatorResponse {
  readonly id: number;
  readonly result?: CapacityTerminalSnapshot;
  readonly error?: string;
}

export interface CapacityTerminalEmulator {
  write(data: string | Uint8Array): void;
  resize(columns: number, rows: number): Promise<void>;
  flush(): Promise<void>;
  snapshot(): Promise<CapacityTerminalSnapshot>;
  dispose(): Promise<void>;
}

export function createCapacityTerminalEmulator(
  columns: number,
  rows: number,
): CapacityTerminalEmulator {
  const worker = new Worker(new URL("./emulator-worker.ts", import.meta.url), {
    execArgv: ["--import=tsx"],
    workerData: { columns, rows },
  });
  const requests = new Map<
    number,
    {
      readonly resolve: (value: CapacityTerminalSnapshot | undefined) => void;
      readonly reject: (error: Error) => void;
    }
  >();
  let requestId = 0;
  let pending = Promise.resolve<CapacityTerminalSnapshot | undefined>(undefined);
  let disposed = false;

  const rejectOutstanding = (error: Error): void => {
    for (const request of requests.values()) request.reject(error);
    requests.clear();
  };
  worker.on("message", (response: EmulatorResponse) => {
    const request = requests.get(response.id);
    if (!request) return;
    requests.delete(response.id);
    if (response.error) request.reject(new Error(response.error));
    else request.resolve(response.result);
  });
  worker.on("error", rejectOutstanding);
  worker.on("exit", (code) => {
    if (!disposed && code !== 0) {
      rejectOutstanding(new Error(`capacity terminal emulator worker exited ${code}`));
    }
  });

  const request = (
    message: Omit<EmulatorRequest, "id">,
  ): Promise<CapacityTerminalSnapshot | undefined> =>
    new Promise((resolve, reject) => {
      const id = ++requestId;
      requests.set(id, { resolve, reject });
      worker.postMessage({ id, ...message } satisfies EmulatorRequest);
    });

  const enqueue = (
    operation: () => Promise<CapacityTerminalSnapshot | undefined>,
  ): Promise<CapacityTerminalSnapshot | undefined> => {
    const queued = pending.then(operation);
    pending = queued.then(
      (result) => result,
      () => undefined,
    );
    return queued;
  };

  return Object.freeze({
    write(data: string | Uint8Array) {
      if (disposed) return;
      void enqueue(() => request({ operation: "write", data }));
    },
    async resize(nextColumns: number, nextRows: number) {
      if (disposed) throw new Error("The terminal emulator is disposed");
      await enqueue(() => request({ operation: "resize", columns: nextColumns, rows: nextRows }));
    },
    async flush() {
      if (disposed) throw new Error("The terminal emulator is disposed");
      await pending;
    },
    async snapshot() {
      if (disposed) throw new Error("The terminal emulator is disposed");
      const result = await enqueue(() => request({ operation: "snapshot" }));
      if (!result) throw new Error("The terminal emulator returned no snapshot");
      return result;
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      try {
        await enqueue(() => request({ operation: "dispose" }));
      } finally {
        rejectOutstanding(new Error("The terminal emulator is disposed"));
        await worker.terminate();
      }
    },
  });
}
