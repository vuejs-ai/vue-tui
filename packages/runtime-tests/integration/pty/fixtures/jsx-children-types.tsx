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
import { Box, Text } from "@vue-tui/runtime";
import { Static } from "@vue-tui/runtime/inline";

// @ts-expect-error Newline is ordinary Text composition, not a public component.
type _RemovedNewline = typeof import("@vue-tui/runtime").Newline;
// @ts-expect-error Spacer is ordinary growing Box composition, not a public component.
type _RemovedSpacer = typeof import("@vue-tui/runtime").Spacer;
// @ts-expect-error Transform remains a private renderer mechanism.
type _RemovedTransform = typeof import("@vue-tui/runtime").Transform;

// Children are accepted (the shim's whole purpose under the automatic runtime).
export const accepted = [
  <Text color="green">plain text child</Text>,
  <Text color="initial" backgroundColor="#12abEF" inverse wrap="truncate">
    narrowed text props
  </Text>,
  <Box flexDirection="row">
    <Text>nested child</Text>
  </Box>,
  <Box
    flexDirection="column"
    alignItems="stretch"
    justifyContent="space-between"
    width="55.9%"
    height={2}
    paddingLeft={1}
    borderStyle="single"
    borderColor="gray"
    overflowY="hidden"
  >
    <Text>narrowed box props</Text>
  </Box>,
  <Static>
    <Text>ordinary static child</Text>
  </Static>,
];

// Declared props stay validated — children must not widen the prop bag.
export const rejected = [
  // @ts-expect-error `display` accepts "flex" | "none", not a number
  <Box display={123}>x</Box>,
  // @ts-expect-error `bold` accepts a boolean, not a string
  <Text bold="yes">x</Text>,
  // @ts-expect-error `bogusProp` is not a declared Box prop
  <Box bogusProp="x">x</Box>,
  // @ts-expect-error reverse directions are not in the minimum Box vocabulary
  <Box flexDirection="row-reverse">x</Box>,
  // @ts-expect-error height is a cell count, not a percentage
  <Box height="100%">x</Box>,
  // @ts-expect-error spacing shorthands are outside the public primitive
  <Box paddingX={1}>x</Box>,
  // @ts-expect-error custom/unevidenced border presets are outside the public primitive
  <Box borderStyle="double">x</Box>,
  // @ts-expect-error unknown color aliases are not public
  <Text color="grey">x</Text>,
  // @ts-expect-error only wrap and end-truncate behavior remain public
  <Text wrap="truncate-middle">x</Text>,
  // @ts-expect-error underline is not in the minimum Text vocabulary
  <Text underline>x</Text>,
  // @ts-expect-error Static does not own collection items.
  <Static items={[1]}>x</Static>,
  // @ts-expect-error Static does not own cross-item layout style.
  <Static style={{ flexDirection: "row" }}>x</Static>,
  // @ts-expect-error `<Text>` has an ordinary default slot, not a scoped slot
  <Text>{({ item }: { item: string }) => item}</Text>,
  // @ts-expect-error `<Box>` has no named `foo` slot
  <Box>{{ foo: () => <Text>x</Text> }}</Box>,
];
