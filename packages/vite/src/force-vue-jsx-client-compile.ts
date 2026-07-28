import type { Plugin } from "vite";

// @vitejs/plugin-vue-jsx has no supported option for selecting client output, while
// unplugin-vue-jsx cannot replace it because it does not implement HMR. The app runs
// in Vite's SSR runnable environment but uses Vue's client renderer, so patch the
// JSX compiler's transform/load hook argument to emit client code with HMR hooks.
type Hook = (this: unknown, ...args: unknown[]) => unknown;
type HookSlot = Hook | { handler?: Hook } | undefined;

// Idempotent: config resolution can encounter the same JSX plugin object more than
// once. Re-wrapping would be harmless but pointless.
const patched = new WeakSet<object>();

export function forceVueJsxClientCompile(plugin: Plugin): void {
  if (patched.has(plugin)) return;
  patched.add(plugin);
  const slots = plugin as Record<"transform" | "load", HookSlot>;
  const wrap = (orig: Hook): Hook =>
    function (this: unknown, ...args: unknown[]): unknown {
      const opt = args[args.length - 1];
      if (opt && typeof opt === "object") {
        // Clone — do NOT mutate. Vite reuses this options object for the transform hooks of
        // plugins ordered AFTER vue-jsx, so flipping ssr in place would leak ssr:false to
        // them. The JSX hook gets client output; the shared object stays untouched.
        const patchedOptions = { ...(opt as Record<string, unknown>), ssr: false };
        return orig.apply(this, [...args.slice(0, -1), patchedOptions]);
      }
      return orig.apply(this, args);
    };
  for (const name of ["transform", "load"] as const) {
    const hook = slots[name];
    if (typeof hook === "function") slots[name] = wrap(hook);
    else if (hook && typeof hook.handler === "function") hook.handler = wrap(hook.handler);
  }
}
