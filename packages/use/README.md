# @vue-tui/use

Reusable Vue composables and renderless helpers built only from the public `@vue-tui/runtime` API.

## Install

```sh
npm install @vue-tui/use @vue-tui/runtime
# peer deps: @vue-tui/runtime, vue ^3.5
```

## `useInputWhileMounted`

Call the hook in a component that stays mounted, then bind the returned Vue function ref directly to the vnode whose mount lifetime should control input:

```vue
<script setup lang="ts">
import { useInputWhileMounted } from "@vue-tui/use";

const targetRef = useInputWhileMounted(
  (event) => {
    if (event.key.name === "escape") closePanel();
  },
  { type: "key" },
);
</script>

<template>
  <Panel v-if="panelOpen" :ref="targetRef" />
</template>
```

There is no separate `shallowRef()` or `useTemplateRef()` to declare. Vue calls the function ref with the referenced value when the vnode mounts and with `null` when it unmounts; the hook enables and disables its underlying `useInput()` subscription at those two points.

The optional `type` selector accepts `"text"`, `"key"`, or `"paste"`. It delivers only that exact `TuiInputEvent` member and narrows the handler type. Omit the selector to receive the complete event union. The hook reads the selector once when it subscribes; a live handler ref is still resolved when each matching event arrives.

The referenced value is intentionally opaque. It does not become an input source, destination, focus owner, or routing boundary. Input keeps the broadcast semantics of `useInput()`, and the handler may be either a function or a live handler ref. Bind each returned function ref to one `ref` attribute.

This API follows mount lifetime, not visibility. `v-if` unmounts and disables the subscription. `v-show` leaves the vnode mounted and therefore leaves it active. If the ref is on a component, changes inside that component do not matter while the referenced component itself remains mounted.

## `<UseInputWhileMounted>`

Use the renderless component when the template should define the lifetime directly:

```vue
<script setup lang="ts">
import { UseInputWhileMounted } from "@vue-tui/use/components";

function closePanel(): void {
  // ...
}
</script>

<template>
  <UseInputWhileMounted
    v-if="panelOpen"
    type="key"
    @input="$event.key.name === 'escape' && closePanel()"
  >
    <Panel />
  </UseInputWhileMounted>
</template>
```

It adds no host node or layout and renders only its default slot. Its optional `type` prop filters input and lets Vue language tooling narrow `$event` to the selected member. The prop is reactive. Omit it to emit the complete `TuiInputEvent` union. Changing, hiding, or conditionally removing only the slot content does not stop input while `<UseInputWhileMounted>` itself remains mounted.

Choose the hook when another vnode already owns the useful lifetime and the calling component should remain mounted. Choose the component when a declarative wrapper is the clearest lifetime boundary.

## License

MIT
