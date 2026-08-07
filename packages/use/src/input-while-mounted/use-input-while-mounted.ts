import { isRef, shallowRef, type MaybeRef } from "vue";
import { useInput, type TuiInputEvent } from "@vue-tui/runtime";

type InputType = TuiInputEvent["type"];
type InputEventOf<Type extends InputType> = Extract<TuiInputEvent, { readonly type: Type }>;
type InputHandler<Event extends TuiInputEvent = TuiInputEvent> = (event: Event) => void;

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
    throw new TypeError('useInputWhileMounted() options only supports the "type" property');
  }
  const type: unknown = Reflect.get(options, "type");
  if (type !== "text" && type !== "key" && type !== "paste") {
    throw new TypeError('useInputWhileMounted() type must be "text", "key", or "paste"');
  }
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

  if (options === undefined) {
    useInput(handler as MaybeRef<InputHandler>, { isActive: mounted });
  } else {
    const selectedType = readInputType(options);
    if (typeof handler !== "function" && !isRef(handler)) {
      throw new TypeError("useInputWhileMounted() handler must be a function");
    }

    const callHandler =
      typeof handler === "function"
        ? (event: TuiInputEvent) => handler(event)
        : (event: TuiInputEvent) => {
            const currentHandler: unknown = handler.value;

            if (typeof currentHandler !== "function") {
              throw new TypeError("useInputWhileMounted() handler must be a function");
            }

            currentHandler(event);
          };

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
