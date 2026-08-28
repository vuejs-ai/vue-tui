# Component authoring

This record covers authoring mechanics shared by Runtime primitives and higher-level vue-tui components. Package admission and ownership are decided elsewhere: [Runtime intent](./intent.md#reusable-runtime-behavior), [`@vue-tui/components` principles](./components-design-principles.md), and [package layers](./package-layers.md).

## Default form

Use a Vue `<script setup>` SFC with a template by default. Runtime's public `Box`, `Text`, and `Static` primitives all use this form. `@vue-tui/components` also exports SFCs through stable author-facing constructors.

Use `defineComponent()` with a render function only when the component must inspect or transform its actual child VNodes. A template cannot inspect `slots.default()` without materializing the slot separately; do not call a slot twice to force vnode inspection into template authoring.

Two questions select the Vue idiom:

- For context such as nested Text state, use provide/inject. Never walk parent instances or compare component names.
- For the actual shape of child VNodes, use a render function and inspect the slot exactly once.

## Runtime host boundary

The raw `tui-box`, `tui-text`, `tui-virtual-text`, and `tui-static` elements are Runtime implementation details. Consumers and higher-level packages use public `Box`, `Text`, and `Static` components instead.

Runtime SFCs that bind host props use camelCase or `v-bind="object"`. Custom-renderer attributes are matched by exact key, so `:flex-grow="1"` is not equivalent to `:flexGrow="1"`.

Runtime components publish stable author-facing constructor types rather than generated SFC `DefineComponent` types. The same applies to `@vue-tui/components`: default-slot components preserve typed children and exposed handles, while leaf components reject ignored children.

## Current Text validation

`Text` validates its closed prop contract during component render, including when its content is empty. Both `color` and `backgroundColor` accept the public `Color` grammar plus `"default"`; they do not accept `"revert"` or `"initial"`.

This keeps invalid authored values on Vue's component-error path instead of letting them reach a post-flush paint callback. The exact accepted and rejected values are enforced by [`public-prop-contract.test.tsx`](../../tests/runtime/integration/components/public-prop-contract.test.tsx).

## Runtime versus Components

`Newline` and `Spacer` are not Runtime primitives. They remain public convenience components in `@vue-tui/components`, alongside `ScrollBox`, `Spinner`, and `Table`.

A higher-level component composes only supported Runtime package entries. It never imports raw hosts, Yoga nodes, Runtime source paths, or `@vue-tui/runtime/internal/*`.

## Authoring checks

- Declare props, events, slots, models, and exposed handles so both Vue templates and TSX reject misuse.
- Pass live function-valued props into composables with `toRef()` or a closure that reads the current prop; do not snapshot a handler during setup.
- Use `defineExpose()` only for genuinely imperative actions that cannot be expressed with props, models, events, or slots.
- Keep implementation files under package `src/`; put declaration and behavior tests under the package's `tests/` tree.
- Verify exported SFC declarations through a packed consumer so consumers may use another supported Vue patch without inheriting build-time SFC generic details.
