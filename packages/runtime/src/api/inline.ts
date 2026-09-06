import StaticSfc from "../vue/components/static.vue";
import type { PublicComponent } from "../vue/components/with-children.ts";

/**
 * Commit a mounted subtree once to terminal scrollback, then stop repainting it.
 *
 * - Import from `@vue-tui/runtime/inline`; no props, no collection API.
 * - Commits on first non-empty output, then releases its slot subtree. Accepted
 *   history never moves.
 * - `v-show` does not change eligibility; use `v-if`.
 * - Fullscreen rejects it — that mode owns a viewport and delegates no history.
 *
 * @example Emit finished work above a live progress line
 * ```vue
 * <Static v-for="entry in completed" :key="entry.id">
 *   <Text>done {{ entry.name }}</Text>
 * </Static>
 * <Text>{{ remaining }} remaining</Text>
 * ```
 */
export const Static = StaticSfc as unknown as PublicComponent<Record<never, never>>;
