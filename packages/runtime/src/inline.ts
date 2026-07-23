import StaticSfc from "./components/static.vue";
import type { PublicComponent } from "./components/with-children.ts";

/** Commit the first non-empty eligible output from one mounted Vue slot tree to Inline history. */
export const Static = StaticSfc as unknown as PublicComponent<Record<never, never>>;
