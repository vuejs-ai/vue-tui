import { unlink } from "node:fs/promises";
import { createConnection, createServer, type Server, type Socket } from "node:net";
import { createEventAddress } from "./address.ts";
import { describeError } from "./errors.ts";
import { EVENT_STREAM_END, EVENT_STREAM_END_REQUEST } from "./protocol.ts";

const DEFAULT_EVENT_TIMEOUT_MS = 20_000;

export interface TestEvent {
  readonly seq: number;
  readonly ev: string;
  readonly data?: unknown;
}

export interface ExpectEventOptions {
  readonly after?: number;
  readonly predicate?: (event: TestEvent) => boolean;
  readonly timeoutMs?: number;
}

export interface QuiesceOptions {
  readonly ignore?: (event: TestEvent) => boolean;
}

/**
 * The child transport disappeared before it could finish the event protocol.
 *
 * Kept distinct from malformed events and sequence violations: a test may
 * deliberately kill its child, but it must never opt out of protocol integrity.
 */
export class EventChannelPrematureCloseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EventChannelPrematureCloseError";
  }
}

export interface EventChannel {
  readonly address: string;
  readonly events: readonly TestEvent[];
  readonly failure: Error | undefined;
  expectEvent(event: string, options?: ExpectEventOptions): Promise<TestEvent>;
  quiesce(ms: number, options?: QuiesceOptions): Promise<void>;
  /**
   * Ask the launcher to terminate the event protocol before process teardown.
   *
   * The acknowledgement makes the boundary causal: a close before it is an
   * unexpected child failure; a close after it is harness-owned cleanup.
   */
  finish(ms: number): Promise<Error | undefined>;
  onChange(listener: () => void): () => void;
  close(): Promise<void>;
}

type ChangeListener = (event?: TestEvent) => void;

export function assertPositiveDuration(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive finite number`);
  }
}

/**
 * Connect to a channel the way `launcher.ts` does from inside the child. Only
 * the harness's own unit tests need this; a real child connects for itself.
 */
export async function connectToChannel(channel: EventChannel): Promise<Socket> {
  const socket = createConnection(channel.address);
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("error", reject);
  });
  return socket;
}

// Both ends of this channel are ours, so this is not a trust boundary and does
// not need to restate the type. The one check that earns its place is strictly
// increasing `seq`: the emitter's counter lives on a `globalThis` key precisely
// because the runtime exists as two module copies in dev, and a fork of that
// counter would silently make cross-sender ordering meaningless.
function eventFromLine(line: string, lastSeq: number): TestEvent {
  let value: Record<string, unknown>;
  try {
    value = JSON.parse(line) as Record<string, unknown>;
  } catch (error) {
    throw new Error(`Event channel received invalid JSON: ${describeError(error)}`);
  }

  const seq = value.seq;
  if (typeof seq !== "number" || !Number.isInteger(seq) || seq <= lastSeq) {
    throw new Error(
      `Event channel sequence numbers must be strictly increasing integers (received ${JSON.stringify(seq)} after ${lastSeq}). ` +
        "Two emitters in one child is the usual cause.",
    );
  }

  return Object.freeze(
    Object.prototype.hasOwnProperty.call(value, "data")
      ? { seq, ev: value.ev as string, data: value.data }
      : { seq, ev: value.ev as string },
  );
}

// Says what it waited for, not what the channel had seen. The event log is
// context, and every caller that reaches a human — `ViteChild` — already attaches
// it along with the command, screen, and exit status; embedding it here printed
// the whole log twice in one failure.
function timeoutDiagnostic(awaitedEvent: string, timeoutMs: number): Error {
  return new Error(
    `Timed out after ${timeoutMs}ms waiting for event ${JSON.stringify(awaitedEvent)}`,
  );
}

async function listen(server: Server, address: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error): void => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = (): void => {
      server.off("error", onError);
      resolve();
    };

    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(address);
  });
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

async function removeSocketFile(address: string): Promise<void> {
  if (process.platform === "win32") {
    return;
  }

  try {
    await unlink(address);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}

export async function createEventChannel(): Promise<EventChannel> {
  const address = createEventAddress();
  const eventLog: TestEvent[] = [];
  const changeListeners = new Set<ChangeListener>();
  let lastSeq = 0;
  let streamBuffer = "";
  let streamSocket: Socket | undefined;
  let connectedOnce = false;
  let failure: Error | undefined;
  let completed = false;
  let closing = false;
  let closePromise: Promise<void> | undefined;
  let finishPromise: Promise<Error | undefined> | undefined;
  let finishRequested = false;

  const notify = (event?: TestEvent): void => {
    for (const listener of changeListeners) {
      listener(event);
    }
  };

  const fail = (error: unknown): void => {
    if (failure !== undefined || completed || closing) {
      return;
    }
    failure = error instanceof Error ? error : new Error(`Event channel failed: ${String(error)}`);
    notify();
  };

  const complete = (): void => {
    if (failure !== undefined || completed || closing) {
      return;
    }
    completed = true;
    notify();
  };

  const acceptLine = (line: string): void => {
    if (failure !== undefined || completed) {
      return;
    }
    try {
      const event = eventFromLine(line, lastSeq);
      lastSeq = event.seq;
      eventLog.push(event);
      notify(event);
    } catch (error) {
      fail(error);
    }
  };

  const server = createServer((socket) => {
    if (connectedOnce) {
      socket.destroy();
      fail(new Error("Event channel accepts exactly one connection"));
      return;
    }

    connectedOnce = true;
    streamSocket = socket;
    socket.setEncoding("utf8");
    if (finishRequested) {
      socket.write(EVENT_STREAM_END_REQUEST);
    }
    socket.on("data", (chunk: string) => {
      streamBuffer += chunk;
      let newline = streamBuffer.indexOf("\n");
      while (newline !== -1) {
        const line = streamBuffer.slice(0, newline);
        streamBuffer = streamBuffer.slice(newline + 1);
        acceptLine(line);
        newline = streamBuffer.indexOf("\n");
      }
    });
    socket.on("error", (error) => {
      fail(
        new EventChannelPrematureCloseError(
          `Event channel connection failed before completion: ${describeError(error)}`,
        ),
      );
    });
    socket.on("end", () => {
      if (streamBuffer.length > 0) {
        fail(new Error("Event channel ended with a partial event line"));
      } else if (eventLog.at(-1)?.ev === EVENT_STREAM_END) {
        complete();
      } else {
        fail(
          new EventChannelPrematureCloseError(
            `Event channel connection ended before the final ${EVENT_STREAM_END} event`,
          ),
        );
      }
    });
    socket.on("close", () => {
      if (!completed) {
        fail(new EventChannelPrematureCloseError("Event channel connection closed"));
      }
    });
  });

  try {
    await listen(server, address);
  } catch (error) {
    await removeSocketFile(address);
    throw error;
  }
  server.on("error", fail);

  const expectEvent = (
    awaitedEvent: string,
    options: ExpectEventOptions = {},
  ): Promise<TestEvent> => {
    const after = options.after ?? 0;
    const timeoutMs = options.timeoutMs ?? DEFAULT_EVENT_TIMEOUT_MS;
    try {
      assertPositiveDuration(timeoutMs, "timeoutMs");
    } catch (error) {
      return Promise.reject(error);
    }

    return new Promise<TestEvent>((resolve, reject) => {
      let timer: NodeJS.Timeout | undefined;
      const finish = (result: TestEvent | Error, rejected: boolean): void => {
        changeListeners.delete(check);
        if (timer !== undefined) {
          clearTimeout(timer);
        }
        if (rejected) {
          reject(result);
        } else {
          resolve(result as TestEvent);
        }
      };
      const check = (): void => {
        let match: TestEvent | undefined;
        try {
          match = eventLog
            .slice(after)
            .find(
              (event) =>
                event.ev === awaitedEvent &&
                (options.predicate === undefined || options.predicate(event)),
            );
        } catch (error) {
          finish(error instanceof Error ? error : new Error(String(error)), true);
          return;
        }
        if (match !== undefined) {
          finish(match, false);
        } else if (failure !== undefined) {
          finish(failure, true);
        } else if (completed) {
          finish(
            new Error(
              `Event channel completed before event ${JSON.stringify(awaitedEvent)} was received`,
            ),
            true,
          );
        }
      };

      changeListeners.add(check);
      timer = setTimeout(() => {
        finish(timeoutDiagnostic(awaitedEvent, timeoutMs), true);
      }, timeoutMs);
      check();
    });
  };

  const quiesce = (ms: number, options: QuiesceOptions = {}): Promise<void> => {
    try {
      assertPositiveDuration(ms, "quiesce duration");
    } catch (error) {
      return Promise.reject(error);
    }

    return new Promise<void>((resolve, reject) => {
      let timer: NodeJS.Timeout;
      const finish = (error?: Error): void => {
        clearTimeout(timer);
        changeListeners.delete(onChange);
        if (error === undefined) {
          resolve();
        } else {
          reject(error);
        }
      };
      const arm = (): void => {
        clearTimeout(timer);
        timer = setTimeout(() => finish(), ms);
      };
      const onChange = (event?: TestEvent): void => {
        if (failure !== undefined) {
          finish(failure);
          return;
        }
        if (completed) {
          finish();
          return;
        }
        if (event === undefined) {
          return;
        }
        try {
          if (options.ignore?.(event) !== true) {
            arm();
          }
        } catch (error) {
          finish(error instanceof Error ? error : new Error(String(error)));
        }
      };

      if (failure !== undefined) {
        reject(failure);
        return;
      }
      if (completed) {
        resolve();
        return;
      }
      changeListeners.add(onChange);
      timer = setTimeout(() => finish(), ms);
    });
  };

  const finish = (ms: number): Promise<Error | undefined> => {
    try {
      assertPositiveDuration(ms, "event stream finish duration");
    } catch (error) {
      return Promise.reject(error);
    }
    if (failure !== undefined || completed) {
      return Promise.resolve(failure);
    }

    finishRequested = true;
    finishPromise ??= new Promise<Error | undefined>((resolve) => {
      let timer: NodeJS.Timeout;
      const done = (): void => {
        clearTimeout(timer);
        changeListeners.delete(onFinishChange);
        resolve(failure);
      };
      const onFinishChange = (): void => {
        if (failure !== undefined || completed) {
          done();
        }
      };
      changeListeners.add(onFinishChange);
      timer = setTimeout(() => {
        fail(new Error(`Timed out after ${ms}ms finishing the event stream`));
      }, ms);
      streamSocket?.write(EVENT_STREAM_END_REQUEST);
      onFinishChange();
    });
    return finishPromise;
  };

  const onChange = (listener: () => void): (() => void) => {
    const wrapped: ChangeListener = () => {
      try {
        listener();
      } catch (error) {
        changeListeners.delete(wrapped);
        fail(error);
      }
    };
    changeListeners.add(wrapped);
    return () => {
      changeListeners.delete(wrapped);
    };
  };

  const close = (): Promise<void> => {
    closePromise ??= (async () => {
      if (!completed) {
        fail(new Error("Event channel closed"));
      }
      closing = true;
      streamSocket?.destroy();
      await closeServer(server);
      await removeSocketFile(address);
    })();
    return closePromise;
  };

  return {
    address,
    get events(): readonly TestEvent[] {
      return [...eventLog];
    },
    get failure(): Error | undefined {
      return failure;
    },
    expectEvent,
    quiesce,
    finish,
    onChange,
    close,
  };
}
