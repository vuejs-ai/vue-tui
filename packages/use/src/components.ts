import type { TuiInputEvent } from "@vue-tui/runtime";
import UseInputWhileMountedSfc from "./input-while-mounted/use-input-while-mounted.vue";
import type { PublicEventComponent } from "./public-component.ts";

/**
 * Public event-listener inputs accepted by `UseInputWhileMounted`.
 */
export interface UseInputWhileMountedProps {
  onInput?: (event: TuiInputEvent) => void;
}

type UseInputWhileMountedEmit = (event: "input", value: TuiInputEvent) => void;

/**
 * Subscribe to input for exactly the mounted lifetime of this renderless component.
 *
 * - Emits every normalized input fact through `input`; events are still global and broadcast.
 * - Renders only its default slot and adds no host node or layout.
 * - Keeping this component mounted while changing or hiding its slot keeps input active.
 *
 * @example Scope input declaratively
 * ```vue
 * <UseInputWhileMounted v-if="open" @input="handleInput">
 *   <Panel />
 * </UseInputWhileMounted>
 * ```
 */
export const UseInputWhileMounted = UseInputWhileMountedSfc as unknown as PublicEventComponent<
  UseInputWhileMountedProps,
  UseInputWhileMountedEmit
>;
