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
  init(options: KittyKeyboardOptions | undefined, interactive: boolean): void;
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
  let cancelDetection: (() => void) | undefined;

  function enableProtocol(flags: KittyFlagName[]): void {
    stdout.write(`\x1b[>${resolveFlags(flags)}u`);
    enabled = true;
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
        if (!disposed) {
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

    init(options, interactive) {
      if (!options) return;

      const mode = options.mode ?? "auto";
      if (mode === "disabled") return;

      const flags: KittyFlagName[] = options.flags ?? ["disambiguateEscapeCodes"];

      if (mode === "enabled") {
        if ((stdin as { isTTY?: boolean }).isTTY && (stdout as { isTTY?: boolean }).isTTY) {
          enableProtocol(flags);
        }
        return;
      }

      // auto mode
      if (
        !interactive ||
        !(stdin as { isTTY?: boolean }).isTTY ||
        !(stdout as { isTTY?: boolean }).isTTY
      ) {
        return;
      }

      confirmKittySupport(flags);
    },

    dispose(sync = false) {
      disposed = true;
      if (cancelDetection) {
        cancelDetection();
      }
      if (enabled) {
        if (sync) {
          // Signal-exit path (G18, Finding A): flush the disable-kitty escape
          // synchronously so it reaches the fd before signal-exit re-raises.
          // Fall back to fd 1 when the stream has no numeric fd.
          try {
            // The base WriteStream type doesn't declare `fd`; tty streams do.
            const streamFd = (stdout as { fd?: number }).fd;
            const fd = typeof streamFd === "number" ? streamFd : 1;
            fsWriteSync(fd, "\x1b[<u");
          } catch {
            // Best-effort restore during abrupt shutdown.
          }
        } else if (!stdout.destroyed && !(stdout as { writableEnded?: boolean }).writableEnded) {
          // Skip the disable-kitty write on a destroyed/ended stdout: `isTTY`
          // stays cached-truthy after destroy()/end(), so an unguarded write on
          // a teardown where stdout is already gone throws ERR_STREAM_DESTROYED.
          // Mirror Ink's `if (canWriteToStdout) writeBestEffort(stdout,
          // '[<u')` (ink.tsx:792-795).
          stdout.write("\x1b[<u");
        }
        enabled = false;
      }
    },
  };

  return controller;
}
