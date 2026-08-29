# Documenting the public API

Every export from a first-party public package entry carries an attached TSDoc block, because go-to-definition and hover are where users actually read the API. A public export without one is incomplete, not merely undocumented.

Scope: `@vue-tui/runtime` (root and `/inline`), `@vue-tui/use` (root and `/components`), `@vue-tui/components`, `@vue-tui/testing`, and `@vue-tui/vite`. Internal entries, package-metadata entries, and private helpers are exempt.

## The shape

1. **One sentence** naming what the API is for. No preamble, no restating the name.
2. **Bullets** for what the signature cannot show — defaults that surprise, ownership rules, throwing conditions, deliberate non-goals. Two to four is normal.
3. **One or two `@example` blocks**, each with a short scenario title, showing a real call a reader can paste.

````ts
/**
 * A growing `Box` that eats the free space along the main axis.
 *
 * - Exactly `<Box flexGrow={1} />`, named for intent. No props.
 * - Follows the parent's `flexDirection`.
 *
 * @example Push a status to the right edge
 * ```tsx
 * <Box width="100%">
 *   <Text>file.ts</Text>
 *   <Spacer />
 *   <Text color="green">saved</Text>
 * </Box>
 * ```
 */
````

## Rules that cost something to rediscover

- **Restraint over completeness.** If the type already says it, delete the bullet. Prop lists, return shapes, and parameter names belong to the signature; the block explains what the signature cannot.
- **`//` comments never reach hover.** Only `/** */` does. A maintainer note about an implementation choice goes _above_ the JSDoc, never between it and the declaration, or the block stops attaching.
- **Overloads take the block on the first signature**, not on the implementation.
- **The fence language must match the example's syntax.** `vue` for template syntax (`v-for`, `:count="2"`), `tsx` for JSX (`count={2}`). A `v-for` inside a `tsx` fence is wrong even though both render.
- **Examples are code, not prose.** Write them against the real types. A discriminated union needs real narrowing — `event.key.name` does not compile after only ruling out `type === "text"`, because `paste` remains in the union.
- **Don't duplicate the README.** The README orients and compares; the TSDoc answers "what do I type here". Overlap invites the two to drift apart.

## Why this form

Users hit hover far more often than they open a README, and hover has no room for essays — an unstructured paragraph is skipped. The one sentence answers "is this the thing I want", the bullets carry the traps, and the example is the part people copy. Ordering them that way means the reader can stop at any point and still have gained something.
