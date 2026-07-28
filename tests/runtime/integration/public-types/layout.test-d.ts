import { shallowRef, type ComponentPublicInstance, type Ref } from "vue";
import { expectTypeOf } from "vite-plus/test";
import { Box, Text, useBoxMetrics, useLayoutSize } from "@vue-tui/runtime";
import type { MountOptions, UseBoxMetricsReturn, UseLayoutSizeReturn } from "@vue-tui/runtime";

// Runtime publishes only the layout facts applications have demonstrated.
expectTypeOf<NonNullable<MountOptions["mode"]>>().toEqualTypeOf<"inline" | "fullscreen">();
expectTypeOf<ReturnType<typeof useLayoutSize>>().toEqualTypeOf<
  import("@vue-tui/runtime").UseLayoutSizeReturn
>();

const layout: UseLayoutSizeReturn = useLayoutSize();
const layoutWidth = layout.width;
const layoutHeight = layout.height;
// @ts-expect-error Runtime-owned layout width is readonly.
layoutWidth.value = 40;
// @ts-expect-error Runtime-owned layout height is readonly.
layoutHeight.value = 24;

// @ts-expect-error The broad Runtime session graph is private.
export type _RenderSessionWasRemoved = import("@vue-tui/runtime").RenderSession;
// @ts-expect-error Requested/effective mode resolution is private.
export type _RenderModeResolutionWasRemoved = import("@vue-tui/runtime").RenderModeResolution;
// @ts-expect-error Output writer policy is private.
export type _RenderOutputWasRemoved = import("@vue-tui/runtime").RenderOutput;
// @ts-expect-error Physical terminal dimensions are not a public Runtime type.
export type _RenderSizeWasRemoved = import("@vue-tui/runtime").RenderSize;
// @ts-expect-error The old combined layout wrapper was removed.
export type _RenderLayoutSizeWasRemoved = import("@vue-tui/runtime").RenderLayoutSize;
// @ts-expect-error Experimental layout width was replaced by useLayoutSize().
export type _UseLayoutWidthWasRemoved = typeof import("@vue-tui/runtime").useLayoutWidth;
// @ts-expect-error Experimental viewport height was replaced by useLayoutSize().
export type _UseViewportHeightWasRemoved = typeof import("@vue-tui/runtime").useViewportHeight;
// @ts-expect-error Experimental box size was replaced by useBoxMetrics().
export type _UseBoxSizeWasRemoved = typeof import("@vue-tui/runtime").useBoxSize;
// @ts-expect-error The broad session hook was removed.
export type _UseRenderSessionWasRemoved = typeof import("@vue-tui/runtime").useRenderSession;

// @ts-expect-error useWindowSize and its numeric-row WindowSize type were removed.
export type _WindowSizeWasRemoved = import("@vue-tui/runtime").WindowSize;

const boxHost = shallowRef<InstanceType<typeof Box> | null>(null);
const boxMetrics: UseBoxMetricsReturn = useBoxMetrics(boxHost);
expectTypeOf(boxMetrics.width).toEqualTypeOf<Readonly<Ref<number>>>();
expectTypeOf(boxMetrics.height).toEqualTypeOf<Readonly<Ref<number>>>();
expectTypeOf(boxMetrics.left).toEqualTypeOf<Readonly<Ref<number>>>();
expectTypeOf(boxMetrics.top).toEqualTypeOf<Readonly<Ref<number>>>();
expectTypeOf(boxMetrics.hasMeasured).toEqualTypeOf<Readonly<Ref<boolean>>>();
// @ts-expect-error Accepted Box metrics width is readonly.
boxMetrics.width.value = 1;
// @ts-expect-error Accepted Box metrics height is readonly.
boxMetrics.height.value = 1;
// @ts-expect-error Accepted Box metrics left is readonly.
boxMetrics.left.value = 1;
// @ts-expect-error Accepted Box metrics top is readonly.
boxMetrics.top.value = 1;
// @ts-expect-error Accepted Box metrics hasMeasured is readonly.
boxMetrics.hasMeasured.value = true;

const textHost = shallowRef<InstanceType<typeof Text> | null>(null);
// @ts-expect-error Text layout has separate semantics and is not a Box size target.
useBoxMetrics(textHost);
const customHost = shallowRef<ComponentPublicInstance | null>(null);
// @ts-expect-error Arbitrary component refs do not mean one measurable Box.
useBoxMetrics(customHost);
declare const rawBoxHost: InstanceType<typeof Box>;
// @ts-expect-error A raw component value cannot represent target attachment and detachment.
useBoxMetrics(rawBoxHost);
// @ts-expect-error Callers can wrap a derived target in computed(); Runtime accepts refs only.
useBoxMetrics(() => boxHost.value);
