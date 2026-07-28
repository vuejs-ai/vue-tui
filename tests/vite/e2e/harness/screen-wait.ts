import { RUNTIME_TEST_EVENT } from "@vue-tui/runtime/internal/testing";
import { assertPositiveDuration, type EventChannel } from "./events.ts";
import { asError } from "./errors.ts";
import type { HarnessScreen } from "./screen.ts";

const DEFAULT_SCREEN_TIMEOUT_MS = 20_000;

export interface ExpectScreenOptions {
  readonly after?: number;
  readonly timeoutMs?: number;
}

export function waitForScreen(
  channel: EventChannel,
  screen: HarnessScreen,
  predicate: (screen: string) => boolean,
  diagnostic: (error: Error) => Error,
  options: ExpectScreenOptions = {},
): Promise<string> {
  const after = options.after ?? channel.events.length;
  if (!Number.isInteger(after) || after < 0) {
    return Promise.reject(new RangeError("screen event cursor must be a non-negative integer"));
  }
  const timeoutMs = options.timeoutMs ?? DEFAULT_SCREEN_TIMEOUT_MS;
  try {
    assertPositiveDuration(timeoutMs, "screen timeoutMs");
  } catch (error) {
    return Promise.reject(error);
  }

  return new Promise<string>((resolve, reject) => {
    let cursor = after;
    let paintSeen =
      options.after === undefined &&
      channel.events.some((event) => event.ev === RUNTIME_TEST_EVENT.paintCommitted);
    let finished = false;
    let timer: NodeJS.Timeout | undefined;
    let unsubscribeEvents: (() => void) | undefined;
    let unsubscribeScreen: (() => void) | undefined;

    const cleanup = (): void => {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      unsubscribeEvents?.();
      unsubscribeScreen?.();
    };

    const rejectWithDiagnostic = (error: unknown): void => {
      if (finished) {
        return;
      }
      finished = true;
      cleanup();
      const cause = asError(error);
      try {
        reject(diagnostic(cause));
      } catch (diagnosticError) {
        reject(
          new AggregateError(
            [cause, diagnosticError],
            "Screen wait failed and its diagnostic could not be created",
          ),
        );
      }
    };

    const accept = (text: string): void => {
      if (finished) {
        return;
      }
      finished = true;
      cleanup();
      resolve(text);
    };

    const check = (acceptAlreadyVisible = false): void => {
      if (finished) {
        return;
      }
      if (channel.failure !== undefined) {
        rejectWithDiagnostic(channel.failure);
        return;
      }
      if (screen.failure !== undefined) {
        rejectWithDiagnostic(screen.failure);
        return;
      }

      const events = channel.events;
      if (events.slice(cursor).some((event) => event.ev === RUNTIME_TEST_EVENT.paintCommitted)) {
        paintSeen = true;
      }
      cursor = events.length;

      let text: string;
      let matches: boolean;
      try {
        text = screen.currentText();
        matches = predicate(text);
      } catch (error) {
        rejectWithDiagnostic(error);
        return;
      }
      if (matches && (paintSeen || acceptAlreadyVisible)) {
        accept(text);
      }
    };

    check(options.after === undefined);
    if (finished) {
      return;
    }

    try {
      unsubscribeEvents = channel.onChange(() => {
        check();
      });
      unsubscribeScreen = screen.onChange(() => {
        check();
      });
    } catch (error) {
      rejectWithDiagnostic(error);
      return;
    }
    timer = setTimeout(() => {
      rejectWithDiagnostic(
        new Error(`Timed out after ${timeoutMs}ms waiting for the expected screen`),
      );
    }, timeoutMs);
  });
}
