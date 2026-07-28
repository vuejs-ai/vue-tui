import { shallowRef, type ComponentPublicInstance, type Ref } from "vue";
import { expectTypeOf } from "vite-plus/test";
import { Box, Text, useFocus } from "@vue-tui/runtime";
import type { FocusTarget, UseFocusReturn } from "@vue-tui/runtime";

const textHost = shallowRef<InstanceType<typeof Text> | null>(null);
const customHost = shallowRef<ComponentPublicInstance | null>(null);
declare const rawBoxHost: InstanceType<typeof Box>;

// Runtime publishes one unique focus identity and optional rendered-component
// validity without publishing navigation, scopes, or input routing.
expectTypeOf<FocusTarget>().toEqualTypeOf<
  Readonly<Ref<ComponentPublicInstance | null | undefined>>
>();
expectTypeOf<UseFocusReturn>().toEqualTypeOf<{
  readonly isFocused: Readonly<Ref<boolean>>;
  focus(): void;
  blur(): void;
}>();
const logicalFocus = useFocus();
const targetedFocus = useFocus(customHost);
const textFocus = useFocus(textHost);
expectTypeOf(logicalFocus).toEqualTypeOf<UseFocusReturn>();
expectTypeOf(targetedFocus).toEqualTypeOf<UseFocusReturn>();
expectTypeOf(textFocus).toEqualTypeOf<UseFocusReturn>();
expectTypeOf(logicalFocus.focus()).toEqualTypeOf<void>();
expectTypeOf(logicalFocus.blur()).toEqualTypeOf<void>();
// @ts-expect-error Focus state is Runtime-owned and readonly.
logicalFocus.isFocused.value = false;
// @ts-expect-error A raw component instance does not carry target lifecycle.
useFocus(rawBoxHost);
// @ts-expect-error A getter is not a Vue component target ref.
useFocus(() => customHost.value);
// @ts-expect-error A target ref must resolve to component public instances.
useFocus(shallowRef(42));
// @ts-expect-error Focus acquisition has no options or policy argument.
useFocus(customHost, {});
// @ts-expect-error A VNode is renderer input, not a mounted component boundary.
useFocus(shallowRef<import("vue").VNode | null>(null));
// @ts-expect-error Host renderer nodes are private and are not focus targets.
useFocus(shallowRef<{ readonly type: "box" } | null>(null));
