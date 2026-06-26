import type { Plugin } from "vite";

// Force @vitejs/plugin-vue to emit CLIENT render functions (with HMR-accept hooks)
// even though the app runs in Vite's SSR runnable environment. plugin-vue derives
// ssr/client output from the last options arg of its transform/load hooks; flipping
// ssr:false there yields client render fns while the module runner still rewrites
// imports. Without this, plugin-vue emits ssrRender (HTML strings) and no HMR.
type Hook = (this: unknown, ...args: unknown[]) => unknown;
type HookSlot = Hook | { handler?: Hook } | undefined;

export function forceClientCompile(plugin: Plugin): void {
  const slots = plugin as unknown as Record<"transform" | "load", HookSlot>;
  const wrap = (orig: Hook): Hook =>
    function (this: unknown, ...args: unknown[]): unknown {
      const opt = args[args.length - 1];
      if (opt && typeof opt === "object") (opt as { ssr?: boolean }).ssr = false;
      return orig.apply(this, args);
    };
  for (const name of ["transform", "load"] as const) {
    const hook = slots[name];
    if (typeof hook === "function") slots[name] = wrap(hook);
    else if (hook && typeof hook.handler === "function") hook.handler = wrap(hook.handler);
  }
}
