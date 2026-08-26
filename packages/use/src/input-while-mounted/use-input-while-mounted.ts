import { shallowRef, type MaybeRef } from "vue";
import { useInput, type TuiInputEvent } from "@vue-tui/runtime";
import { resolveHandlerSource } from "../input/handler-source.ts";

type InputType = TuiInputEvent["type"];
type InputEventOf<Type extends InputType> = Extract<TuiInputEvent, { readonly type: Type }>;
type InputHandler<Event extends TuiInputEvent = TuiInputEvent> = (event: Event) => void;

/** The one accepted-`type` check shared by the composable and its renderless component. */
export function assertInputType(
  value: unknown,
  apiName = "useInputWhileMounted()",
): asserts value is InputType {
  if (value === "text" || value === "key" || value === "paste") return;
  throw new TypeError(`${apiName} type must be "text", "key", or "paste"`);
}

function readInputType(options: unknown): InputType {
  if (
    typeof options !== "object" ||
    options === null ||
    Object.getPrototypeOf(options) !== Object.prototype
  ) {
    throw new TypeError("useInputWhileMounted() options must be a plain object");
  }
  const keys = Reflect.ownKeys(options);
  if (keys.length !== 1 || keys[0] !== "type") {
    throw new TypeError('useInputWhileMounted() options requires exactly the "type" property');
  }
  const type: unknown = Reflect.get(options, "type");
  assertInputType(type);
  return type;
}

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
 * - Pass a `type` option to deliver only that event member with a narrowed handler type.
 * - The referenced value is only a lifecycle signal, never an input target or focus owner.
 * - `v-show` keeps the vnode mounted, so it also keeps the subscription active.
 *
 * @example Listen while a panel exists
 * ```vue
 * <script setup lang="ts">
 * import { useInputWhileMounted } from "@vue-tui/use";
 *
 * const targetRef = useInputWhileMounted((event) => {
 *   if (event.key.name === "escape") close();
 * }, { type: "key" });
 * </script>
 *
 * <template>
 *   <Panel v-if="open" :ref="targetRef" />
 * </template>
 * ```
 */
export function useInputWhileMounted(handler: MaybeRef<InputHandler>): InputWhileMountedTargetRef;
export function useInputWhileMounted<Type extends InputType>(
  handler: MaybeRef<InputHandler<InputEventOf<Type>>>,
  options: { readonly type: Type },
): InputWhileMountedTargetRef;
export function useInputWhileMounted(
  handler: unknown,
  options?: unknown,
): InputWhileMountedTargetRef {
  const mounted = shallowRef(false);
  // Options first: a malformed selector is reported as such even when the handler
  // is also wrong.
  const selectedType = options === undefined ? undefined : readInputType(options);
  const callHandler = resolveHandlerSource<TuiInputEvent>(
    "useInputWhileMounted()",
    handler as MaybeRef<InputHandler>,
  );

  if (selectedType === undefined) {
    useInput(callHandler, { isActive: mounted });
  } else {
    useInput(
      (event) => {
        if (event.type !== selectedType) return;
        callHandler(event);
      },
      { isActive: mounted },
    );
  }

  return (value) => {
    mounted.value = value !== null;
  };
}
