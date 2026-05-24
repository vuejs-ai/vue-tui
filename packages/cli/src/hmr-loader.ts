const VITE_PORT = process.env.VUE_TUI_HMR_PORT || "5173";
const HMR_PREFIX = `file://${process.cwd()}/.vue-tui-hmr`;

export async function resolve(
  specifier: string,
  context: unknown,
  nextResolve: Function,
): Promise<{ url: string; shortCircuit?: boolean }> {
  if (/^\/hmr_patch_\d+\.js$/.test(specifier)) {
    return { url: `${HMR_PREFIX}${specifier}`, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}

export async function load(
  url: string,
  context: unknown,
  nextLoad: Function,
): Promise<{ format: string; source: string; shortCircuit?: boolean }> {
  if (url.startsWith(HMR_PREFIX)) {
    const path = url.slice(HMR_PREFIX.length);
    const res = await fetch(`http://localhost:${VITE_PORT}${path}`);
    if (!res.ok) throw new Error(`HMR patch fetch failed: ${res.status}`);
    return { format: "module", source: await res.text(), shortCircuit: true };
  }
  return nextLoad(url, context);
}
