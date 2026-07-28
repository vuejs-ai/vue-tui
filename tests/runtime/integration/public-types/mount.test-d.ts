import type { Readable, Writable } from "node:stream";
import { expectTypeOf } from "vite-plus/test";
import type { ColorProfile, MountOptions, RenderToStringOptions } from "@vue-tui/runtime";

const defaultMountOptions: MountOptions = {};
const inlineMountOptions: MountOptions = { mode: "inline" };
const fullscreenMountOptions: MountOptions = { mode: "fullscreen" };
const automaticMountOptions: MountOptions = { color: true };
const plainMountOptions: MountOptions = { color: false };
const truecolorMountOptions: MountOptions = { color: "truecolor" };
expectTypeOf(defaultMountOptions).toMatchTypeOf<MountOptions>();
expectTypeOf(inlineMountOptions).toMatchTypeOf<MountOptions>();
expectTypeOf(fullscreenMountOptions).toMatchTypeOf<MountOptions>();
expectTypeOf(automaticMountOptions).toMatchTypeOf<MountOptions>();
expectTypeOf(plainMountOptions).toMatchTypeOf<MountOptions>();
expectTypeOf(truecolorMountOptions).toMatchTypeOf<MountOptions>();
expectTypeOf<keyof MountOptions>().toEqualTypeOf<
  "stdout" | "stdin" | "stderr" | "mode" | "color" | "patchConsole" | "exitOnCtrlC"
>();
expectTypeOf<ColorProfile>().toEqualTypeOf<"ansi16" | "ansi256" | "truecolor">();
expectTypeOf<MountOptions["color"]>().toEqualTypeOf<boolean | ColorProfile | undefined>();
expectTypeOf<MountOptions["exitOnCtrlC"]>().toEqualTypeOf<boolean | undefined>();

declare const nodeReadable: Readable;
declare const nodeWritable: Writable;
const streamMountOptions: MountOptions = {
  stdin: nodeReadable,
  stdout: nodeWritable,
  stderr: nodeWritable,
};
expectTypeOf<MountOptions["stdin"]>().toEqualTypeOf<Readable | undefined>();
expectTypeOf<MountOptions["stdout"]>().toEqualTypeOf<Writable | undefined>();
expectTypeOf<MountOptions["stderr"]>().toEqualTypeOf<Writable | undefined>();

declare const webWritable: WritableStream;
const rejectedWebWritable: MountOptions = {
  // @ts-expect-error Web WritableStream uses a different writer and backpressure protocol.
  stdout: webWritable,
};

const stringRenderOptions: RenderToStringOptions = {
  width: 80,
  height: 24,
  color: "ansi256",
};
expectTypeOf<keyof RenderToStringOptions>().toEqualTypeOf<"width" | "height" | "color">();
expectTypeOf<RenderToStringOptions["color"]>().toEqualTypeOf<boolean | ColorProfile | undefined>();
// @ts-expect-error String-render layout input is readonly after construction.
stringRenderOptions.width = 40;

// @ts-expect-error Only the two finite render-mode values are accepted.
const invalidMode: MountOptions = { mode: "full-screen" };

// @ts-expect-error Only booleans and named terminal color profiles are accepted.
const invalidColor: MountOptions = { color: "none" };

// @ts-expect-error Automatic behavior is represented by true or omission, not a string member.
const invalidStringColor: RenderToStringOptions = { color: "auto" };

void automaticMountOptions;
void plainMountOptions;
void streamMountOptions;
void rejectedWebWritable;
void invalidMode;
void invalidColor;
void invalidStringColor;
