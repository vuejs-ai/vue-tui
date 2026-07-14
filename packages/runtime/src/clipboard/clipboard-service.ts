import { readonly, shallowRef, type ShallowRef } from "vue";

export type ClipboardTransportResult =
  | { readonly status: "copied" }
  | { readonly status: "requested" }
  | { readonly status: "unavailable"; readonly reason?: string }
  | { readonly status: "rejected"; readonly cause?: unknown };

export interface CustomClipboardTransport {
  readonly kind: "custom";
  readonly writeText: (
    text: string,
  ) => ClipboardTransportResult | PromiseLike<ClipboardTransportResult>;
}

export interface Osc52ClipboardTransport {
  readonly kind: "osc52";
}

export type ClipboardTransport = CustomClipboardTransport | Osc52ClipboardTransport;

export type ClipboardUnavailableReason =
  | "not-configured"
  | "output-not-terminal"
  | "screen-reader"
  | "suspended"
  | "disposed"
  | "string-host"
  | "transport-unavailable";

export type ClipboardAvailability =
  | { readonly status: "available"; readonly transport: "custom" | "osc52" }
  | { readonly status: "unavailable"; readonly reason: ClipboardUnavailableReason };

export type ClipboardWriteResult =
  | { readonly status: "copied"; readonly text: string }
  | { readonly status: "requested"; readonly text: string }
  | {
      readonly status: "unavailable";
      readonly text: string;
      readonly reason: ClipboardUnavailableReason;
      readonly detail?: string;
    }
  | { readonly status: "rejected"; readonly text: string; readonly cause: unknown };

export interface InternalClipboardService {
  readonly availability: Readonly<ShallowRef<ClipboardAvailability>>;
  writeText(text: string): Promise<ClipboardWriteResult>;
  suspend(): void;
  resume(): void;
  dispose(): void;
}

export interface InternalClipboardServiceOptions {
  readonly transport: ClipboardTransport | undefined;
  readonly osc52Available: boolean;
  readonly osc52UnavailableReason?: "output-not-terminal" | "screen-reader";
  readonly writeOsc52: (text: string) => void;
  readonly stringHost?: boolean;
}

const AVAILABLE_CUSTOM = Object.freeze({
  status: "available" as const,
  transport: "custom" as const,
});
const AVAILABLE_OSC52 = Object.freeze({
  status: "available" as const,
  transport: "osc52" as const,
});

function unavailable(reason: ClipboardUnavailableReason): ClipboardAvailability {
  return Object.freeze({ status: "unavailable", reason });
}

function validateTransportResult(result: unknown): ClipboardTransportResult {
  if (typeof result !== "object" || result === null || !("status" in result)) {
    throw new TypeError("clipboard transport must return a result object");
  }
  const candidate = result as { readonly status?: unknown; readonly reason?: unknown };
  if (
    candidate.status !== "copied" &&
    candidate.status !== "requested" &&
    candidate.status !== "unavailable" &&
    candidate.status !== "rejected"
  ) {
    throw new TypeError(
      'clipboard transport result status must be "copied", "requested", "unavailable", or "rejected"',
    );
  }
  if (
    candidate.status === "unavailable" &&
    candidate.reason !== undefined &&
    typeof candidate.reason !== "string"
  ) {
    throw new TypeError("clipboard transport unavailable reason must be a string or undefined");
  }
  return result as ClipboardTransportResult;
}

export function normalizeClipboardTransport(value: unknown): ClipboardTransport | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "object" || value === null) {
    throw new TypeError('mount option "clipboard" must be a clipboard transport object');
  }
  const candidate = value as { readonly kind?: unknown; readonly writeText?: unknown };
  if (candidate.kind === "osc52") return Object.freeze({ kind: "osc52" });
  if (candidate.kind === "custom" && typeof candidate.writeText === "function") {
    return Object.freeze({
      kind: "custom",
      writeText: candidate.writeText as CustomClipboardTransport["writeText"],
    });
  }
  throw new TypeError(
    'mount option "clipboard" must have kind "osc52", or kind "custom" with a writeText function',
  );
}

export function createInternalClipboardService(
  options: InternalClipboardServiceOptions,
): InternalClipboardService {
  let suspended = false;
  let disposed = false;
  let queue = Promise.resolve<void>(undefined);

  const baseAvailability = (): ClipboardAvailability => {
    if (options.stringHost) return unavailable("string-host");
    if (!options.transport) return unavailable("not-configured");
    if (options.transport.kind === "custom") return AVAILABLE_CUSTOM;
    return options.osc52Available
      ? AVAILABLE_OSC52
      : unavailable(options.osc52UnavailableReason ?? "output-not-terminal");
  };

  const mutableAvailability = shallowRef<ClipboardAvailability>(baseAvailability());
  const refreshAvailability = (): void => {
    mutableAvailability.value = disposed
      ? unavailable("disposed")
      : suspended
        ? unavailable("suspended")
        : baseAvailability();
  };

  const run = async (text: string): Promise<ClipboardWriteResult> => {
    const availability = mutableAvailability.value;
    if (availability.status === "unavailable") {
      return Object.freeze({ status: "unavailable", text, reason: availability.reason });
    }

    const transport = options.transport!;
    if (transport.kind === "osc52") {
      try {
        options.writeOsc52(text);
        return Object.freeze({ status: "requested", text });
      } catch (cause) {
        return Object.freeze({ status: "rejected", text, cause });
      }
    }

    try {
      const result = validateTransportResult(await transport.writeText(text));
      if (result.status === "copied" || result.status === "requested") {
        return Object.freeze({ status: result.status, text });
      }
      if (result.status === "unavailable") {
        return Object.freeze({
          status: "unavailable",
          text,
          reason: "transport-unavailable",
          ...(result.reason === undefined ? {} : { detail: result.reason }),
        });
      }
      return Object.freeze({ status: "rejected", text, cause: result.cause });
    } catch (cause) {
      return Object.freeze({ status: "rejected", text, cause });
    }
  };

  return {
    availability: readonly(mutableAvailability) as Readonly<ShallowRef<ClipboardAvailability>>,
    writeText(text) {
      if (typeof text !== "string") {
        return Promise.reject(new TypeError("useClipboard().writeText() text must be a string"));
      }
      const availability = mutableAvailability.value;
      if (availability.status === "unavailable") {
        return Promise.resolve(
          Object.freeze({ status: "unavailable", text, reason: availability.reason }),
        );
      }
      let resolve!: (result: ClipboardWriteResult) => void;
      const result = new Promise<ClipboardWriteResult>((done) => {
        resolve = done;
      });
      queue = queue.then(async () => {
        resolve(await run(text));
      });
      return result;
    },
    suspend() {
      if (disposed || suspended) return;
      suspended = true;
      refreshAvailability();
    },
    resume() {
      if (disposed || !suspended) return;
      suspended = false;
      refreshAvailability();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      refreshAvailability();
    },
  };
}

export function createStringClipboardService(): InternalClipboardService {
  return createInternalClipboardService({
    transport: undefined,
    osc52Available: false,
    writeOsc52() {},
    stringHost: true,
  });
}
