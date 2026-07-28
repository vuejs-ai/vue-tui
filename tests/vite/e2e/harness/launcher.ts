import { createConnection } from "node:net";
import process from "node:process";
import { emitTestEvent, setTestEventSink } from "@vue-tui/runtime/internal/testing";
import { EVENT_ADDRESS_ENV, EVENT_STREAM_END, EVENT_STREAM_END_REQUEST } from "./protocol.ts";

const address = process.env[EVENT_ADDRESS_ENV];
if (address === undefined || address.length === 0) {
  throw new Error(`[vue-tui test harness] ${EVENT_ADDRESS_ENV} is missing`);
}

const socket = createConnection(address);
await new Promise<void>((resolve, reject) => {
  const onConnect = (): void => {
    socket.off("error", onError);
    resolve();
  };
  const onError = (error: Error): void => {
    socket.off("connect", onConnect);
    reject(
      new Error(
        `[vue-tui test harness] could not connect to event channel ${JSON.stringify(address)}`,
        { cause: error },
      ),
    );
  };
  socket.once("connect", onConnect);
  socket.once("error", onError);
});
// Reporting must not keep an otherwise-finished Vite process alive. The
// `beforeExit` handler refs the socket again while it drains the final event.
socket.unref();

// Reporting failure must not change the production behavior under test. The
// parent channel records a disconnect and rejects its own waiters.
socket.on("error", () => {});

let ending = false;
setTestEventSink((line) => {
  if (ending) {
    return;
  }

  let finalEvent = false;
  try {
    finalEvent = (JSON.parse(line) as { readonly ev?: unknown }).ev === EVENT_STREAM_END;
  } catch {
    // The emitter owns serialization, so this can only be a future protocol
    // mismatch. Forward the line and let the parent name the parse failure.
  }

  if (finalEvent) {
    ending = true;
    socket.ref();
    socket.end(`${line}\n`);
  } else {
    socket.write(`${line}\n`);
  }
});

const endEventStream = (): void => {
  if (ending) return;
  emitTestEvent(EVENT_STREAM_END, { code: process.exitCode ?? 0 });
};

let requestBuffer = "";
socket.setEncoding("utf8");
socket.on("data", (chunk: string) => {
  requestBuffer += chunk;
  let newline = requestBuffer.indexOf("\n");
  while (newline !== -1) {
    const request = requestBuffer.slice(0, newline + 1);
    requestBuffer = requestBuffer.slice(newline + 1);
    if (request === EVENT_STREAM_END_REQUEST) {
      endEventStream();
    }
    newline = requestBuffer.indexOf("\n");
  }
});

process.once("beforeExit", endEventStream);
