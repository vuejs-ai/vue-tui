import type { PropType } from "vue";

export const rejectedMouseListenerNames = [
  "onMousedown",
  "onMouseup",
  "onClick",
  "onWheel",
] as const;

export type RejectedMouseListenerName = (typeof rejectedMouseListenerNames)[number];

/**
 * Keep the removed listener names visible to Vue and TypeScript so they fail as
 * component props instead of silently falling through to a host node.
 */
export const rejectedMouseListenerProps = {
  onMousedown: null as unknown as PropType<never>,
  onMouseup: null as unknown as PropType<never>,
  onClick: null as unknown as PropType<never>,
  onWheel: null as unknown as PropType<never>,
};

/**
 * Vue's resolved props cannot distinguish an omitted optional prop from every
 * JavaScript value a caller can force through `any`. The current vnode retains
 * that own-property distinction, so component render functions validate it
 * before any accessibility or empty-content branch can skip the host node.
 */
export function assertNoRejectedMouseListeners(
  component: "Box" | "Text",
  rawProps: Record<string, unknown> | null,
): true {
  for (const name of rejectedMouseListenerNames) {
    if (rawProps && Object.prototype.hasOwnProperty.call(rawProps, name)) {
      throw new Error(
        `<${component}> does not accept the removed mouse listener "${name}". ` +
          `Use the mouse composables from "@vue-tui/runtime/fullscreen".`,
      );
    }
  }
  return true;
}
