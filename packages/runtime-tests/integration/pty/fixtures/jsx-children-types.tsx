/**
 * Type-only regression fixture — NOT a runnable PTY program (nothing spawns it,
 * and it is not a `*.test.tsx` so vitest never collects it). It exists purely so
 * `tsc -p integration/pty/fixtures/tsconfig.json` type-checks it.
 *
 * It pins the contract the `WithChildren` shim establishes under the automatic
 * JSX runtime (`jsx: "react-jsx"`, this dir's tsconfig — the mode the main
 * runtime-tests tsconfig does NOT use): components accept JSX children while
 * their declared props stay fully validated. If the shim regresses in either
 * direction, this file fails to compile:
 *   - children rejected     -> the `accepted` cases error
 *   - prop validation lost   -> the `@ts-expect-error` directives become unused
 */
import { Box, Newline, Spacer, Text, Transform } from "@vue-tui/runtime";
import { Static } from "@vue-tui/runtime/inline";

// Children are accepted (the shim's whole purpose under the automatic runtime).
export const accepted = [
  <Text color="green">plain text child</Text>,
  <Box flexDirection="row">
    <Text>nested child</Text>
  </Box>,
  <Static>
    <Text>ordinary static child</Text>
  </Static>,
  <Transform transform={(line) => line}>
    <Text>transformed child</Text>
  </Transform>,
  <Newline />,
  <Spacer />,
];

const invalidScopedTransformSlot = {
  default: ({ item }: { item: string }) => <Text>{item}</Text>,
};

// Declared props stay validated — children must not widen the prop bag.
export const rejected = [
  // @ts-expect-error `display` accepts "flex" | "none", not a number
  <Box display={123}>x</Box>,
  // @ts-expect-error `bold` accepts a boolean, not a string
  <Text bold="yes">x</Text>,
  // @ts-expect-error `bogusProp` is not a declared Box prop
  <Box bogusProp="x">x</Box>,
  // @ts-expect-error `transform` is required
  <Transform>x</Transform>,
  // @ts-expect-error Static does not own collection items.
  <Static items={[1]}>x</Static>,
  // @ts-expect-error Static does not own cross-item layout style.
  <Static style={{ flexDirection: "row" }}>x</Static>,
  // @ts-expect-error `<Text>` has an ordinary default slot, not a scoped slot
  <Text>{({ item }: { item: string }) => item}</Text>,
  // @ts-expect-error `<Box>` has no named `foo` slot
  <Box>{{ foo: () => <Text>x</Text> }}</Box>,
  // @ts-expect-error `<Transform>` has an ordinary default slot, not a scoped slot
  <Transform transform={(line) => line}>{invalidScopedTransformSlot}</Transform>,
  // @ts-expect-error `<Newline>` does not accept children
  <Newline>x</Newline>,
  // @ts-expect-error `<Spacer>` does not accept children
  <Spacer>x</Spacer>,
];
