import { shallowRef, type MaybeRef } from "vue";
import { useInput, type TuiInputEvent } from "@vue-tui/runtime";

type InputHandler = (event: TuiInputEvent) => void;

/**
 * A Vue function ref that marks its one bound vnode as mounted or unmounted.
 *
 * Bind one returned ref to one `ref` attribute. The referenced value stays
 * opaque: it is used only to observe Vue's non-null and `null` assignments.
 */
export type InputWhileMountedTargetRef = (value: object | null) => void;

/**
 * Subscribe to input while one vnode bound through the returned function ref is mounted.
 *
 * - Bind the return value directly with `:ref`; no separate template ref is needed.
 * - The referenced value is only a lifecycle signal, never an input target or focus owner.
 * - `v-show` keeps the vnode mounted, so it also keeps the subscription active.
 *
 * @example Listen while a panel exists
 * ```vue
 * <script setup lang="ts">
 * import { useInputWhileMounted } from "@vue-tui/use";
 *
 * const targetRef = useInputWhileMounted((event) => {
 *   if (event.type === "key" && event.key.name === "escape") close();
 * });
 * </script>
 *
 * <template>
 *   <Panel v-if="open" :ref="targetRef" />
 * </template>
 * ```
 */
export function useInputWhileMounted(handler: MaybeRef<InputHandler>): InputWhileMountedTargetRef {
  const mounted = shallowRef(false);
  useInput(handler, { isActive: mounted });

  return (value) => {
    mounted.value = value !== null;
  };
}
