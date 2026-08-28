# Input while mounted

## Current API

The package exposes the same lifecycle-scoped input behavior from two supported entries:

```ts
// @vue-tui/use
useInputWhileMounted(handler): InputWhileMountedTargetRef
useInputWhileMounted(handler, { type: "text" | "key" | "paste" }): InputWhileMountedTargetRef

// @vue-tui/use/components
UseInputWhileMounted: { type?: "text" | "key" | "paste" }
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

Both authoring forms accept the public input discriminator as an optional selector. Omitting it preserves the complete `TuiInputEvent` union. Selecting `"key"`, `"text"`, or `"paste"` filters delivery to that exact event member and narrows the handler or emitted event type without adding separate mounted variants. The hook snapshots its options value during setup so its narrowed handler cannot later receive another event type. The component reads its prop reactively; a dynamic prop typed as a union produces the corresponding event union.

The renderless `<UseInputWhileMounted>` companion emits `input` during its own mounted lifetime and renders only its default slot. It is exported from `@vue-tui/use/components`, rather than the `@vue-tui/use` root or `@vue-tui/components`, because it is an alternate authoring form of independent headless behavior and renders no named UI. The general package-entry ruling is vouched in [package layers](./package-layers.md#renderless-companions-of-independent-hooks).

## Semantics

- Activation follows the vnode that owns the function ref, not the component that called the hook. The caller can stay mounted while the referenced vnode appears, disappears, and remounts.
- One returned function ref is for one `ref` binding. The hook needs only the null/non-null lifecycle transition and publishes no target handle.
- `v-if` removes the bound vnode and disables input. `v-show` preserves mount and keeps input active.
- A ref on a component follows that component vnode. Replacing or hiding only its descendants does not deactivate the hook.
- `<UseInputWhileMounted>` follows the wrapper component itself. Removing or hiding only its slot content does not deactivate it.
- Selection uses the public `event.type` tag exactly. A `"key"` selector does not receive a `"text"` event that also carries key data, and a `"text"` selector does not receive paste.
- Both forms delegate to public `useInput()`, including normalized `TuiInputEvent`, live handler refs, managed terminal demand, broadcast delivery, and scope cleanup. They add no focus, target routing, priority, propagation, or consumption.

The renderless component's stable public constructor takes its props as a generic constructor argument. This lets Vue language tooling infer the selector from a template attribute. The same generic event member appears in both `$props.onInput` and `$emit`; keeping only one side narrow would leave template `$event` inference incomplete.

The root stays composable-only, while renderless companions use the `/components` entry. Their source files use the same kebab-case base with different extensions.

## Evidence

- `packages/use/tests/input-while-mounted/use-input-while-mounted.test.tsx` proves function-ref activation, teardown, remount, `v-show`, exact type filtering, live handler resolution, and static selector capture; `packages/use/tests/input-while-mounted/component.test.tsx` proves the renderless companion's output, mounted lifetime, and reactive selector.
- `packages/use/tests/public-api.test.ts`, `packages/use/tests/public-api.test-d.tsx`, and `packages/use/tests/input-while-mounted/public-api.test-d.vue` pin the exact value surface and compile real TSX and template usage, including positive and negative selector/event narrowing.
- `tests/runtime/integration/package-boundaries.test.ts` enforces that `@vue-tui/use` imports only supported Runtime entries and never Runtime source or internals.
