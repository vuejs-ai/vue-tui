// packages/runtime/src/io/kitty-keyboard.ts

import { writeSync as fsWriteSync } from "node:fs";

const textEncoder = new TextEncoder();

export const kittyFlags = {
  disambiguateEscapeCodes: 1,
  reportEventTypes: 2,
  reportAlternateKeys: 4,
  reportAllKeysAsEscapeCodes: 8,
  reportAssociatedText: 16,
} as const;

export type KittyFlagName = keyof typeof kittyFlags;

export const kittyModifiers = {
  shift: 1,
  alt: 2,
  ctrl: 4,
  super: 8,
  hyper: 16,
  meta: 32,
  capsLock: 64,
  numLock: 128,
} as const;

export type KittyKeyboardOptions = {
  mode?: "auto" | "enabled" | "disabled";
  flags?: KittyFlagName[];
};

export function resolveFlags(flags: KittyFlagName[]): number {
  let result = 0;
  for (const flag of flags) {
    result |= kittyFlags[flag];
  }
  return result;
}

const ESC = 0x1b;
const OPEN_BRACKET = 0x5b;
const QUESTION_MARK = 0x3f;
const LETTER_U = 0x75;
const ZERO = 0x30;
const NINE = 0x39;

const isDigitByte = (byte: number): boolean => byte >= ZERO && byte <= NINE;

type KittyQueryMatch = { state: "complete"; endIndex: number } | { state: "partial" };

export function matchKittyQueryResponse(
  buffer: number[],
  startIndex: number,
): KittyQueryMatch | undefined {
  if (
    buffer[startIndex] !== ESC ||
    buffer[startIndex + 1] !== OPEN_BRACKET ||
    buffer[startIndex + 2] !== QUESTION_MARK
  ) {
    return undefined;
  }

  let index = startIndex + 3;
  const digitsStart = index;
  while (index < buffer.length && isDigitByte(buffer[index]!)) {
    index++;
  }

  if (index === digitsStart) {
    return undefined;
  }

  if (index === buffer.length) {
    return { state: "partial" };
  }

  if (buffer[index] === LETTER_U) {
    return { state: "complete", endIndex: index };
  }

  return undefined;
}

export function hasCompleteKittyQueryResponse(buffer: number[]): boolean {
  for (let index = 0; index < buffer.length; index++) {
    const match = matchKittyQueryResponse(buffer, index);
    if (match?.state === "complete") {
      return true;
    }
  }
  return false;
}

export function stripKittyQueryResponsesAndTrailingPartial(buffer: number[]): number[] {
  const kept: number[] = [];
  let index = 0;
  while (index < buffer.length) {
    const match = matchKittyQueryResponse(buffer, index);
    if (match?.state === "complete") {
      index = match.endIndex + 1;
      continue;
    }
    if (match?.state === "partial") {
      break;
    }
    kept.push(buffer[index]!);
    index++;
  }
  return kept;
}

export interface KittyKeyboardController {
  init(options: KittyKeyboardOptions | undefined, allowAutoDetection: boolean): void;
  /** Temporarily release the physical protocol while retaining its desired configuration. */
  suspend(sync?: boolean): void;
  /** Reacquire the protocol state that was active before suspend(). */
  resume(): void;
  /**
   * @param sync When true, write the disable-kitty escape synchronously
   * (fs.writeSync) so it reaches the fd before an abrupt signal-driven exit
   * re-raises the signal (G18, Finding A). Defaults to async stream.write for
   * the normal unmount path.
   */
  dispose(sync?: boolean): void;
  readonly isEnabled: boolean;
}

export function createKittyKeyboardController(
  stdin: NodeJS.ReadStream,
  stdout: NodeJS.WriteStream,
): KittyKeyboardController {
  let enabled = false;
  let disposed = false;
  let suspended = false;
  let cancelDetection: (() => void) | undefined;
  let configuredMode: "auto" | "enabled" | "disabled" = "disabled";
  let configuredFlags: KittyFlagName[] = ["disambiguateEscapeCodes"];
  let allowConfiguredAutoDetection = false;
  let resumeEnabled = false;
  let resumeDetection = false;

  function enableProtocol(flags: KittyFlagName[]): void {
    stdout.write(`\x1b[>${resolveFlags(flags)}u`);
    enabled = true;
  }

  function disableProtocol(sync = false): boolean {
    try {
      if (sync) {
        const streamFd = (stdout as { fd?: number }).fd;
        if (typeof streamFd === "number") {
          fsWriteSync(streamFd, "\x1b[<u");
        } else if (stdout === process.stdout) {
          fsWriteSync(1, "\x1b[<u");
        } else if (stdout === process.stderr) {
          fsWriteSync(2, "\x1b[<u");
        } else if (!stdout.destroyed && !(stdout as { writableEnded?: boolean }).writableEnded) {
          // A custom stream without an fd may model a different terminal. Never
          // guess process fd 1; write through the stream that was actually used.
          stdout.write("\x1b[<u");
        } else {
          return false;
        }
      } else if (!stdout.destroyed && !(stdout as { writableEnded?: boolean }).writableEnded) {
        stdout.write("\x1b[<u");
      } else {
        return false;
      }
      enabled = false;
      return true;
    } catch {
      // Terminal restoration is best-effort; a failed Kitty write must not
      // prevent the remaining cursor, screen, paste, mouse, or raw cleanup. Keep
      // physical ownership so resume cannot push a duplicate protocol level and
      // dispose can retry the pop.
      return false;
    }
  }

  function confirmKittySupport(flags: KittyFlagName[]): void {
    let responseBuffer: number[] = [];

    const cleanup = (): void => {
      cancelDetection = undefined;
      clearTimeout(timer);
      stdin.removeListener("data", onData);

      const remaining = stripKittyQueryResponsesAndTrailingPartial(responseBuffer);
      responseBuffer = [];
      if (remaining.length > 0) {
        stdin.unshift(Uint8Array.from(remaining) as unknown as string);
      }
    };

    const onData = (data: Uint8Array | string): void => {
      const chunk = typeof data === "string" ? textEncoder.encode(data) : data;
      for (const byte of chunk) {
        responseBuffer.push(byte);
      }

      if (hasCompleteKittyQueryResponse(responseBuffer)) {
        cleanup();
        if (!disposed && !suspended) {
          enableProtocol(flags);
        }
      }
    };

    stdin.on("data", onData);
    const timer = setTimeout(cleanup, 200);
    cancelDetection = cleanup;

    stdout.write("\x1b[?u");
  }

  const controller: KittyKeyboardController = {
    get isEnabled() {
      return enabled;
    },

    init(options, allowAutoDetection) {
      if (!options) return;

      const mode = options.mode ?? "auto";
      configuredMode = mode;
      configuredFlags = options.flags ?? ["disambiguateEscapeCodes"];
      allowConfiguredAutoDetection = allowAutoDetection;
      if (mode === "disabled") return;

      const flags = configuredFlags;

      if (mode === "enabled") {
        if ((stdin as { isTTY?: boolean }).isTTY && (stdout as { isTTY?: boolean }).isTTY) {
          enableProtocol(flags);
        }
        return;
      }

      // auto mode
      if (
        !allowAutoDetection ||
        !(stdin as { isTTY?: boolean }).isTTY ||
        !(stdout as { isTTY?: boolean }).isTTY
      ) {
        return;
      }

      confirmKittySupport(flags);
    },

    suspend(sync = false) {
      if (disposed || suspended) return;
      suspended = true;
      resumeDetection = cancelDetection !== undefined;
      if (cancelDetection) cancelDetection();
      resumeEnabled = enabled;
      if (enabled) disableProtocol(sync);
    },

    resume() {
      if (disposed || !suspended) return;
      const shouldEnable = resumeEnabled;
      const shouldDetect = resumeDetection;
      if (shouldEnable) {
        // A failed suspend pop leaves the original protocol level active. In
        // that case continuation must not push another level.
        if (!enabled) enableProtocol(configuredFlags);
        suspended = false;
        resumeEnabled = false;
        resumeDetection = false;
        return;
      }
      if (
        shouldDetect &&
        configuredMode === "auto" &&
        allowConfiguredAutoDetection &&
        (stdin as { isTTY?: boolean }).isTTY &&
        (stdout as { isTTY?: boolean }).isTTY
      ) {
        confirmKittySupport(configuredFlags);
      }
      suspended = false;
      resumeEnabled = false;
      resumeDetection = false;
    },

    dispose(sync = false) {
      disposed = true;
      if (cancelDetection) {
        cancelDetection();
      }
      if (enabled) {
        disableProtocol(sync);
      }
      suspended = false;
      resumeEnabled = false;
      resumeDetection = false;
    },
  };

  return controller;
}
