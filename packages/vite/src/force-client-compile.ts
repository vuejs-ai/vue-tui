import type { Plugin } from "vite";

// Force @vitejs/plugin-vue to emit CLIENT render functions (with HMR-accept hooks)
// even though the app runs in Vite's SSR runnable environment. plugin-vue derives
// ssr/client output from the last options arg of its transform/load hooks; flipping
// ssr:false there yields client render fns while the module runner still rewrites
// imports. Without this, plugin-vue emits ssrRender (HTML strings) and no HMR.
type Hook = (this: unknown, ...args: unknown[]) => unknown;
type HookSlot = Hook | { handler?: Hook } | undefined;

// Idempotent: a plugin can be handed here more than once (the configResolved sweep may
// revisit our own plugin-vue). Re-wrapping would flip ssr:false twice — harmless but
// pointless — so skip plugins already patched.
const patched = new WeakSet<object>();

export function forceClientCompile(plugin: Plugin): void {
  if (patched.has(plugin)) return;
  patched.add(plugin);
  const slots = plugin as unknown as Record<"transform" | "load", HookSlot>;
  const wrap = (orig: Hook): Hook =>
    function (this: unknown, ...args: unknown[]): unknown {
      const opt = args[args.length - 1];
      if (opt && typeof opt === "object") {
        // Clone — do NOT mutate. Vite reuses this options object for the transform hooks of
        // plugins ordered AFTER vue/vue-jsx, so flipping ssr in place would leak ssr:false to
        // them. The Vue hook gets client output; the shared object stays untouched.
        const patched = { ...(opt as Record<string, unknown>), ssr: false };
        return orig.apply(this, [...args.slice(0, -1), patched]);
      }
      return orig.apply(this, args);
    };
  for (const name of ["transform", "load"] as const) {
    const hook = slots[name];
    if (typeof hook === "function") slots[name] = wrap(hook);
    else if (hook && typeof hook.handler === "function") hook.handler = wrap(hook.handler);
  }
}
