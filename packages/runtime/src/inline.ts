import StaticSfc from "./components/static.vue";
import type { PublicComponent } from "./components/with-children.ts";

/** Commit one mounted Vue slot tree to Inline terminal history exactly once. */
export const Static = StaticSfc as unknown as PublicComponent<Record<never, never>>;
