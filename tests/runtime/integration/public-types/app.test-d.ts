import type { Readable } from "node:stream";
import type { App as VueApp } from "vue";
import { expectTypeOf } from "vite-plus/test";
import { Text, useApp, useStdin } from "@vue-tui/runtime";
import type { TuiApp, UseAppReturn, UseStdinReturn } from "@vue-tui/runtime";

// Composable return types: named per VueUse's `UseXReturn` convention. useStdin() exposes
// the mounted base stream and one independently owned raw-mode hold without publishing
// Runtime's normalized ingress, routing, or protocol machinery.
expectTypeOf<UseStdinReturn>().toEqualTypeOf<{
  readonly stdin: Readable;
  readonly isRawModeSupported: boolean;
  readonly setRawMode: (enabled: boolean) => void;
}>();
expectTypeOf<ReturnType<typeof useStdin>>().toEqualTypeOf<UseStdinReturn>();
expectTypeOf<keyof ReturnType<typeof useStdin>>().toEqualTypeOf<
  "stdin" | "isRawModeSupported" | "setRawMode"
>();
declare const publicStdin: ReturnType<typeof useStdin>;
expectTypeOf(publicStdin.stdin).toEqualTypeOf<Readable>();
expectTypeOf(publicStdin.isRawModeSupported).toEqualTypeOf<boolean>();
expectTypeOf(publicStdin.setRawMode(true)).toEqualTypeOf<void>();
expectTypeOf(publicStdin.setRawMode(false)).toEqualTypeOf<void>();
// @ts-expect-error The mounted stream reference is readonly.
publicStdin.stdin = process.stdin;
// @ts-expect-error Raw-mode capability is a readonly host fact.
publicStdin.isRawModeSupported = false;
// @ts-expect-error Each hook call owns its setter; callers cannot replace it.
publicStdin.setRawMode = () => {};

expectTypeOf<UseAppReturn>().toEqualTypeOf<{
  readonly exit: (error?: Error) => void;
}>();
expectTypeOf<ReturnType<typeof useApp>>().toEqualTypeOf<UseAppReturn>();
expectTypeOf<ReturnType<TuiApp["waitUntilExit"]>>().toEqualTypeOf<Promise<void>>();
expectTypeOf<ReturnType<TuiApp["waitUntilRenderFlush"]>>().toEqualTypeOf<Promise<void>>();
expectTypeOf<TuiApp["config"]>().toEqualTypeOf<VueApp<unknown>["config"]>();
expectTypeOf<TuiApp["runWithContext"]>().toEqualTypeOf<VueApp<unknown>["runWithContext"]>();
expectTypeOf<TuiApp["onUnmount"]>().toEqualTypeOf<VueApp<unknown>["onUnmount"]>();
expectTypeOf<TuiApp["unmount"]>().toEqualTypeOf<VueApp<unknown>["unmount"]>();
expectTypeOf<TuiApp["version"]>().toEqualTypeOf<VueApp<unknown>["version"]>();
declare const publicTuiApp: TuiApp;
const chainedTuiApp = publicTuiApp.use({ install() {} });
expectTypeOf(chainedTuiApp).toEqualTypeOf<TuiApp>();
expectTypeOf(publicTuiApp.mixin({})).toEqualTypeOf<TuiApp>();
expectTypeOf(publicTuiApp.component("PublicRoot", Text)).toEqualTypeOf<TuiApp>();
expectTypeOf(publicTuiApp.directive("public", {})).toEqualTypeOf<TuiApp>();
expectTypeOf(publicTuiApp.provide("answer", 42)).toEqualTypeOf<TuiApp>();
// @ts-expect-error Chained Vue app methods retain the public projection.
void chainedTuiApp._container;
