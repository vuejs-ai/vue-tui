# @vue-tui/use API design

This record applies only to `@vue-tui/use`: reusable headless Vue behavior built entirely from supported public `@vue-tui/runtime` APIs. Package placement is governed by [package architecture](./package-architecture.md); exact exports and types are enforced by source declarations and public API tests.

The root currently exports `useKeyInput`, `usePasteInput`, `useTextInput`, and `useInputWhileMounted`. The `/components` entry exports the renderless `UseInputWhileMounted` companion.

## Package boundary

An API belongs in `@vue-tui/use` when it expresses reusable Vue coordination that is not the internal state or required companion of a specific rendered component and does not require Runtime-private renderer, terminal, layout, paint, protocol, or application-lifecycle ownership. It may observe a caller-selected vnode as a generic Vue lifetime signal and may select or coordinate public Runtime facts, but it must preserve the Runtime contract rather than invent a second input, focus, or rendering model.

New APIs still must qualify as [product work](./intent.md#product-work) and pass the shared [placement test](./package-architecture.md#placement-test); this record does not create a separate package roadmap. The current input selectors establish that a higher-layer API may improve Vue authoring without adding a new Runtime capability, provided it preserves the exact event object and subscription behavior.

## Input selector composables

`useKeyInput()` delivers only the exact `"key"` member of `TuiInputEvent`. `usePasteInput()` delivers only the exact `"paste"` member, including an empty payload and unchanged newlines or control characters. `useTextInput()` delivers only the exact `"text"` member, including its optional logical-key information. All three pass through the original frozen event instead of creating a narrower copy. Key-only, text, and paste remain distinct; a text event carrying key information is still not a key-only event.

All three composables accept the same direct or live-ref handler and reactive `isActive` forms as `useInput()`. A live handler is read only when a matching event arrives. They retain broadcast delivery and add no priority, propagation, consumption, focus, or routing. The narrowed callback type is inferred from the selected event member, so the package does not export redundant key-event, paste-event, or text-event aliases.

## Mounted-lifetime input

`useInputWhileMounted()` couples one public `useInput()` subscription to the mounted lifetime of a vnode selected by the caller:

```ts
useInputWhileMounted(handler): InputWhileMountedTargetRef
useInputWhileMounted(handler, { type: "text" | "key" | "paste" }): InputWhileMountedTargetRef
```

The return value is one stable Vue function ref that the caller binds directly to one vnode. Vue's non-null and null ref callbacks are the complete activation signal; the referenced value stays opaque and is never resolved into a Runtime host, focus owner, input destination, or routing boundary.

`v-if` unmounts the bound vnode and disables input. `v-show` preserves the mount and keeps input active. A component ref follows that component vnode, not changes inside its rendered subtree. The composable snapshots its optional `type` selector during setup so a narrowed handler cannot later receive another event member; a live handler is still resolved for each matching event.

## Renderless companions

The paired `<UseInputWhileMounted>` component is exported from `@vue-tui/use/components`. It renders only its default slot, emits `input` during its own mounted lifetime, and accepts a reactive optional `type` prop that narrows the emitted event. Changing or hiding only the slot content does not deactivate the wrapper.

The root stays composable-only. A renderless companion belongs on `/components`, not in the visual `@vue-tui/components` catalog, because it is another authoring form of independent headless behavior. The general entry-point ruling is vouched in [package architecture](./package-architecture.md#renderless-companions-of-independent-hooks).

## Vue and public types

- Public composables accept live function-valued sources without mistaking a handler for a getter; they resolve the handler at event time.
- Public event types narrow from Runtime's exported discriminated union instead of copying it into package-owned aliases.
- A renderless component declares props and emitted events so both Vue templates and TSX infer the selected event member.
- Public component constructor types hide generated SFC details while preserving props, events, slots, and instance shape across supported Vue patch releases.

## Evidence

- [`input` tests](../../packages/use/tests/input) pin exact event selection, object identity, live handlers, and reactive activation.
- [`input-while-mounted` tests](../../packages/use/tests/input-while-mounted) pin function-ref lifetime, remounting, `v-show`, selector behavior, and template inference.
- [`public-api.test.ts`](../../packages/use/tests/public-api.test.ts) and [`public-api.test-d.tsx`](../../packages/use/tests/public-api.test-d.tsx) pin package entries and TSX types.
- [`package-boundaries.test.ts`](../../tests/runtime/integration/package-boundaries.test.ts) prevents `@vue-tui/use` from importing Runtime source or internal entries.
