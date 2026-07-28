import path from "node:path";
import type { HotPayload, ViteDevServer } from "vite";
import { resolvePhysicalPath } from "./physical-path.ts";

// unplugin-vue broadcasts its rerender-vs-reload custom event ("file-changed") through
// server.ws, but this dev server runs the app in the SSR runnable environment with the
// browser socket off — so the module runner never sees it and every edit falls through
// to a state-RESETTING reload. Forward ws custom payloads onto the ssr environment's hot
// channel so template-only edits do a state-PRESERVING rerender (web parity).
//
// Build/compile errors take the same dead-end path: Vite sends a typed { type: "error" }
// payload through the (browser-socket-off) client channel — which is the same object as
// server.ws here — so without forwarding it the runtime's dev overlay never learns of the
// error. The module runner's HMR handler dispatches `vite:error` straight from a
// { type: "error" } payload (passing the whole payload, whose `.err` the runtime reads),
// so forward the same payload object rather than re-wrapping it as a custom event.

type ErrorPayload = Extract<HotPayload, { type: "error" }>;
type ErrorOrigin = "client" | "ssr";

interface ErrorIdentity {
  readonly phase: unknown;
  readonly message: string;
  readonly name: unknown;
  readonly id: unknown;
  readonly frame: unknown;
  readonly plugin: unknown;
  readonly loc:
    | {
        readonly file: unknown;
        readonly line: unknown;
        readonly column: unknown;
      }
    | undefined;
}

interface PendingError {
  readonly diagnostic: ErrorIdentity;
  readonly timestamp: number | undefined;
}

function runnerPayload(payload: HotPayload, preserveSymlinks: boolean): HotPayload {
  if (payload.type !== "custom" || payload.event !== "file-changed") return payload;
  if (preserveSymlinks) return payload;
  const data = payload.data;
  if (data === null || typeof data !== "object" || Array.isArray(data)) return payload;
  const file = (data as { file?: unknown }).file;
  if (typeof file !== "string" || !path.isAbsolute(file)) return payload;
  const physicalFile = resolvePhysicalPath(file);
  if (physicalFile === file) return payload;

  // unplugin-vue compares this value with the compiled module's physical
  // filename to decide rerender versus reload. Vite may compile through a real
  // path while its watcher reports an equivalent symlink path; normalize only
  // the in-process runner copy and leave the original ws payload untouched.
  return { ...payload, data: { ...data, file: physicalFile } };
}

function errorIdentity(payload: ErrorPayload): ErrorIdentity {
  const { err } = payload;
  return {
    phase: err.phase,
    message: err.message,
    name: err.name,
    id: err.id,
    frame: err.frame,
    plugin: err.plugin,
    loc:
      err.loc === undefined
        ? undefined
        : { file: err.loc.file, line: err.loc.line, column: err.loc.column },
  };
}

/**
 * The client and SSR producers do not always attach the same optional metadata.
 * Vite serializes an unavailable client source frame as `""`, while the SSR
 * preflight supplies the real frame, so both `undefined` and the empty string
 * mean absent here. Two non-empty values must agree. Stack traces are
 * deliberately excluded because the producer path is exactly what differs
 * between the duplicate payloads.
 */
function optionalFieldMatches(left: unknown, right: unknown): boolean {
  const absent = (value: unknown): boolean => value === undefined || value === "";
  return absent(left) || absent(right) || left === right;
}

function sameDiagnostic(left: ErrorIdentity, right: ErrorIdentity): boolean {
  if (left.phase !== right.phase || left.message !== right.message) return false;
  for (const [leftField, rightField] of [
    [left.name, right.name],
    [left.id, right.id],
    [left.frame, right.frame],
    [left.plugin, right.plugin],
  ]) {
    if (!optionalFieldMatches(leftField, rightField)) return false;
  }
  if (left.loc === undefined || right.loc === undefined) return true;
  return (
    optionalFieldMatches(left.loc.file, right.loc.file) &&
    optionalFieldMatches(left.loc.line, right.loc.line) &&
    optionalFieldMatches(left.loc.column, right.loc.column)
  );
}

interface HmrBridgeOptions {
  readonly getUpdateTimestamp?: () => number | undefined;
  readonly preserveSymlinks?: boolean;
  readonly isDuplicateUpdate?: (timestamp: number | undefined) => boolean;
}

export function bridgeHmrEventsToRunner(
  server: ViteDevServer,
  {
    getUpdateTimestamp = () => undefined,
    preserveSymlinks = false,
    isDuplicateUpdate = () => false,
  }: HmrBridgeOptions = {},
): void {
  const ssr = server.environments.ssr;
  if (!ssr) return;
  type SendArgs = [HotPayload] | [string, unknown?];
  const hot = ssr.hot as { send: (...args: SendArgs) => void };
  const originalHotSend = hot.send.bind(hot);

  // One SFC typo is reported by two different producers: the client environment
  // through ws.send, and the SSR environment whose preflight rejected the same
  // update. Pair only that cross-origin duplicate. A general message cache is
  // wrong here: two files can carry the same "Unexpected token" text, and two
  // direct SSR reports are not evidence that the environments duplicated one.
  const unpairedErrors: Record<ErrorOrigin, PendingError[]> = {
    client: [],
    ssr: [],
  };
  let forwardingFromWs = false;

  hot.send = (...args: SendArgs): void => {
    const payload: HotPayload =
      typeof args[0] === "string" ? { type: "custom", event: args[0], data: args[1] } : args[0];
    const timestamp = getUpdateTimestamp();
    // Compiler plugins can emit a custom or error payload before a post hook
    // runs, and Vite can emit its final update afterwards. The pre-hook decision
    // is the one boundary shared by both paths, so suppress every payload from a
    // watcher task already proven to describe the same source state.
    if (isDuplicateUpdate(timestamp)) return;
    if (payload.type === "update" || payload.type === "full-reload") {
      unpairedErrors.client.length = 0;
      unpairedErrors.ssr.length = 0;
    }
    if (payload.type === "error") {
      if (payload.err.phase === undefined) {
        // Errors sent directly by the SSR environment come from its source
        // preflight or runner logger. The evaluator marks its own failures
        // explicitly, so only the remaining source failures default here.
        payload.err.phase = "compile";
      }
      const origin: ErrorOrigin = forwardingFromWs ? "client" : "ssr";
      const identity = errorIdentity(payload);
      const opposite: ErrorOrigin = origin === "client" ? "ssr" : "client";
      // Timestamp is the only proof that two payloads came from the same watcher
      // task. If it is unavailable, fail open and show both diagnostics: a
      // duplicate panel is preferable to swallowing two real errors that merely
      // look alike.
      const match =
        timestamp === undefined
          ? -1
          : unpairedErrors[opposite].findIndex(
              (candidate) =>
                candidate.timestamp === timestamp && sameDiagnostic(candidate.diagnostic, identity),
            );
      if (match !== -1) {
        unpairedErrors[opposite].splice(match, 1);
        return;
      }
      // Keep multiplicity: two same-origin reports are two diagnostics, even
      // when their text is identical. Arrays also let several client errors
      // arrive before the SSR preflight catches up with the same batch.
      if (timestamp !== undefined) {
        unpairedErrors[origin].push({ diagnostic: identity, timestamp });
        originalHotSend("vue-tui:hmr-error-context", { timestamp });
      }
    }
    originalHotSend(...args);
  };

  const ws = server.ws as { send: (...args: SendArgs) => void };
  const originalWsSend = ws.send.bind(ws);
  ws.send = (...args: SendArgs): void => {
    const payload: HotPayload =
      typeof args[0] === "string" ? { type: "custom", event: args[0], data: args[1] } : args[0];
    if (payload.type === "custom" || payload.type === "error") {
      if (payload.type === "error" && payload.err.phase === undefined) {
        // This channel carries errors produced while Vite computes a source
        // update. Mark the phase at its producer; the Runtime cannot infer it
        // reliably from optional plugin, frame, or location fields.
        payload.err.phase = "compile";
      }
      const previousForwarding = forwardingFromWs;
      forwardingFromWs = true;
      try {
        hot.send(runnerPayload(payload, preserveSymlinks));
      } finally {
        forwardingFromWs = previousForwarding;
      }
    }
    originalWsSend(...args);
  };
}
