# Input while mounted

## Current API

The package exposes the same lifecycle-scoped input behavior from two supported entries:

```ts
// @vue-tui/use
useInputWhileMounted(handler): InputWhileMountedTargetRef

// @vue-tui/use/components
UseInputWhileMounted
```

The hook returns a stable Vue function ref. The caller binds that return value directly to one vnode's `ref` attribute:

```vue
<script setup lang="ts">
const targetRef = useInputWhileMounted(handleInput);
</script>

<template>
  <Panel :ref="targetRef" />
</template>
```

This deliberately avoids making the caller declare and pass a separate `shallowRef()` or `useTemplateRef()`. Vue invokes a function ref with a non-null referenced value on mount and with `null` on unmount; those assignments are the complete activation signal. The value itself remains opaque and is never resolved into a Runtime host or used as an input target.

The renderless `<UseInputWhileMounted>` companion emits `input` during its own mounted lifetime and renders only its default slot. It is exported from `@vue-tui/use/components`, rather than the `@vue-tui/use` root or `@vue-tui/components`, because it is an alternate authoring form of independent headless behavior and renders no named UI. The general package-entry ruling is vouched in [package layers](./package-layers.md#renderless-companions-of-independent-hooks).

## Semantics

- Activation follows the vnode that owns the function ref, not the component that called the hook. The caller can stay mounted while the referenced vnode appears, disappears, and remounts.
- One returned function ref is for one `ref` binding. The hook needs only the null/non-null lifecycle transition and publishes no target handle.
- `v-if` removes the bound vnode and disables input. `v-show` preserves mount and keeps input active.
- A ref on a component follows that component vnode. Replacing or hiding only its descendants does not deactivate the hook.
- `<UseInputWhileMounted>` follows the wrapper component itself. Removing or hiding only its slot content does not deactivate it.
- Both forms delegate to public `useInput()`, including normalized `TuiInputEvent`, live handler refs, managed terminal demand, broadcast delivery, and scope cleanup. They add no focus, target routing, priority, propagation, or consumption.

The paired identifiers would not collide at the language level because JavaScript and TypeScript are case-sensitive. They are nevertheless split across the root and `/components` entries so the root remains composable-only and similar future pairs have one predictable import convention. Their source files use the same kebab-case base with different extensions rather than names that differ only by letter case.

## Evidence

- `packages/use/tests/input-while-mounted/use-input-while-mounted.test.tsx` proves function-ref activation, teardown, remount, and `v-show`; `packages/use/tests/input-while-mounted/use-input-while-mounted.vue.test.tsx` proves the renderless companion's output and mounted lifetime.
- `packages/use/tests/public-api.test.ts`, `packages/use/tests/public-api.test-d.tsx`, and `packages/use/tests/input-while-mounted/public-api.test.vue` pin the exact value surface and compile real TSX and template function-ref/event usage, rejecting wrong handlers and props.
- `tests/runtime/integration/public-layer-imports.test.ts` enforces that `@vue-tui/use` imports only supported Runtime entries and never Runtime source or internals.
