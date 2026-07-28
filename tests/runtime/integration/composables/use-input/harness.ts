import type { TuiInputEvent } from "@vue-tui/runtime";
import { captureWrites, makeFakeStdin, makeFakeWritable } from "../../lifecycle/test-streams.ts";

export const PASTE_ON = "\x1b[?2004h";
export const PASTE_OFF = "\x1b[?2004l";

export const noModifiers = {
  shift: false,
  alt: false,
  ctrl: false,
  meta: false,
  super: false,
  hyper: false,
} as const;

export function eventLabel(event: TuiInputEvent): string {
  if (event.type === "text" || event.type === "paste") {
    return `${event.type}:${event.text}`;
  }
  return event.key.name ? `key:${event.key.name}` : `key:${event.key.character}`;
}

export function makeTrackedStreams() {
  const stdout = makeFakeWritable();
  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();
  const rawModeCalls: boolean[] = [];
  Object.assign(stdin, {
    isRaw: false,
    setRawMode(this: NodeJS.ReadStream & { isRaw: boolean }, value: boolean) {
      rawModeCalls.push(value);
      this.isRaw = value;
      return this;
    },
  });
  return {
    stdout,
    stderr,
    stdin,
    rawModeCalls,
    stdoutWrites: captureWrites(stdout),
    destroy() {
      stdin.destroy();
      stdout.destroy();
      stderr.destroy();
    },
  };
}
