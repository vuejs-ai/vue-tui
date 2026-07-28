import { PassThrough } from "node:stream";
import type { InternalMountOptionsInput } from "../../../../../packages/runtime/dist/internal.mjs";
import { nextTick } from "vue";
import type { ContentFrame, RenderResult } from "@vue-tui/testing";

export function makeOutput(options: { readonly isTTY: boolean }): NodeJS.WriteStream {
  const stream = new PassThrough() as unknown as NodeJS.WriteStream;
  Object.assign(stream, { isTTY: options.isTTY, columns: 80, rows: 24 });
  return stream;
}

export function makeTrackedInput(): {
  readonly stream: NodeJS.ReadStream & { isRaw: boolean };
  readonly rawModeCalls: boolean[];
  readonly refBalance: () => number;
} {
  const stream = new PassThrough() as unknown as NodeJS.ReadStream & { isRaw: boolean };
  const rawModeCalls: boolean[] = [];
  let refs = 0;
  Object.assign(stream, {
    isTTY: true,
    isRaw: false,
    setRawMode(this: NodeJS.ReadStream & { isRaw: boolean }, mode: boolean) {
      this.isRaw = mode;
      rawModeCalls.push(mode);
      return this;
    },
    setEncoding(this: NodeJS.ReadStream) {
      return this;
    },
    ref() {
      refs++;
    },
    unref() {
      refs--;
    },
  });
  return { stream, rawModeCalls, refBalance: () => refs };
}

export function countOccurrences(value: string, marker: string): number {
  return value.split(marker).length - 1;
}

export function staticTranscript(frames: readonly ContentFrame[]): string {
  return frames.map((frame) => frame.staticOutput).join("");
}

export async function flush(result: RenderResult): Promise<void> {
  await nextTick();
  await result.waitUntilRenderFlush();
}

export const acceptanceHosts = [
  {
    name: "visual Inline",
    isTTY: true,
    options: { mode: "inline" } satisfies Partial<InternalMountOptionsInput>,
  },
  {
    name: "final non-TTY",
    isTTY: false,
    options: { mode: "inline" } satisfies Partial<InternalMountOptionsInput>,
  },
] as const;
