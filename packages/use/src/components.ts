import type { TuiInputEvent } from "@vue-tui/runtime";
import UseInputWhileMountedSfc from "./input-while-mounted/use-input-while-mounted.vue";
import type { PublicEventComponentInstance } from "./public-component.ts";

type InputType = TuiInputEvent["type"];
type InputEventOf<Type extends InputType> = Extract<TuiInputEvent, { readonly type: Type }>;

/**
 * Public event-listener inputs accepted by `UseInputWhileMounted`.
 *
 * Supplying an input `type` narrows `onInput` to the selected event member.
 * Without a type argument, this describes every accepted prop combination.
 */
export type UseInputWhileMountedProps<Type extends InputType | undefined = InputType | undefined> =
  undefined extends Type
    ? {
        readonly type?: Type;
        onInput?: (event: TuiInputEvent) => void;
      }
    : {
        readonly type: Type;
        onInput?: (event: InputEventOf<Extract<Type, InputType>>) => void;
      };

type UseInputWhileMountedComponent = {
  new <Type extends InputType>(
    props: UseInputWhileMountedProps<Type>,
  ): PublicEventComponentInstance<
    UseInputWhileMountedProps<Type>,
    (event: "input", value: InputEventOf<Type>) => void
  >;

  new (
    props: UseInputWhileMountedProps,
  ): PublicEventComponentInstance<
    UseInputWhileMountedProps,
    (event: "input", value: TuiInputEvent) => void
  >;
};

/**
 * Subscribe to input for exactly the mounted lifetime of this renderless component.
 *
 * - Without `type`, emits every normalized input event through `input`.
 * - A `type` prop filters delivery and narrows the emitted event to that exact member.
 * - Renders only its default slot and adds no host node or layout.
 * - Keeping this component mounted while changing or hiding its slot keeps input active.
 *
 * The public constructor stays independent from the Vue patch release used to
 * compile the SFC; generated `DefineComponent` arity is not a package contract.
 *
 * @example Scope input declaratively
 * ```vue
 * <UseInputWhileMounted v-if="open" type="key" @input="handleKey">
 *   <Panel />
 * </UseInputWhileMounted>
 * ```
 */
export const UseInputWhileMounted =
  UseInputWhileMountedSfc as unknown as UseInputWhileMountedComponent;
