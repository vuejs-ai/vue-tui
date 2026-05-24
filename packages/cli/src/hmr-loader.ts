import { register } from "node:module";

register(
  `data:text/javascript,${encodeURIComponent(`
const VITE_PORT = process.env.VUE_TUI_HMR_PORT || '5173';

export async function resolve(specifier, context, nextResolve) {
  if (/^\\/hmr_patch_\\d+\\.js$/.test(specifier)) {
    return { url: 'vite-hmr://' + specifier, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.startsWith('vite-hmr://')) {
    const path = url.replace('vite-hmr://', '');
    const res = await fetch('http://localhost:' + VITE_PORT + path);
    if (!res.ok) throw new Error('HMR patch fetch failed: ' + res.status);
    return { format: 'module', source: await res.text(), shortCircuit: true };
  }
  return nextLoad(url, context);
}
`)}`,
  import.meta.url,
);
