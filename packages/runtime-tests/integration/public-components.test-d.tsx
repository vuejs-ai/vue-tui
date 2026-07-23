import { Box, Text } from "@vue-tui/runtime";

const completeBox = (
  <Box
    flexDirection="column"
    flexGrow={1.5}
    flexShrink={0}
    flexBasis={0}
    alignItems="center"
    justifyContent="space-between"
    gap={1}
    width="55.9%"
    height={4}
    minWidth={1}
    minHeight={0}
    position="absolute"
    top={-1}
    left={2}
    marginTop={-2}
    paddingTop={1}
    paddingBottom={1}
    paddingLeft={2}
    paddingRight={2}
    borderStyle="round"
    borderColor="gray"
    backgroundColor="#12abEF"
    overflowY="hidden"
    display="flex"
  >
    <Text color="revert" backgroundColor="blue" dimColor bold wrap="truncate">
      text
    </Text>
  </Box>
);

void completeBox;

// Removed layout and paint vocabulary does not survive on the public constructor.
// @ts-expect-error Box no longer publishes flex wrapping.
const boxFlexWrap = <Box flexWrap="wrap" />;
// @ts-expect-error Box no longer publishes per-child alignment.
const boxAlignSelf = <Box alignSelf="center" />;
// @ts-expect-error Box no longer publishes spacing shorthands.
const boxPaddingX = <Box paddingX={1} />;
// @ts-expect-error Box no longer publishes an unevidenced horizontal margin edge.
const boxMarginLeft = <Box marginLeft={1} />;
// @ts-expect-error Box no longer publishes horizontal clipping.
const boxOverflowX = <Box overflowX="hidden" />;
// @ts-expect-error Box borders are indivisible public primitives.
const boxBorderTop = <Box borderTop={false} />;
// @ts-expect-error Only evidenced border presets remain public.
const boxBorderPreset = <Box borderStyle="double" />;
// @ts-expect-error Only row and column remain public.
const boxReverseDirection = <Box flexDirection="row-reverse" />;
// @ts-expect-error Height has no percentage baseline on every host.
const boxPercentageHeight = <Box height="100%" />;

// @ts-expect-error Text no longer publishes unevidenced decoration policy.
const textItalic = <Text italic>text</Text>;
// @ts-expect-error Text no longer publishes unevidenced decoration policy.
const textUnderline = <Text underline>text</Text>;
// @ts-expect-error Text no longer publishes unevidenced decoration policy.
const textStrikethrough = <Text strikethrough>text</Text>;
// @ts-expect-error Selection-only inverse styling is not a public Text primitive.
const textInverse = <Text inverse>text</Text>;
// @ts-expect-error The duplicate end-truncation spelling was removed.
const textTruncateEnd = <Text wrap="truncate-end">text</Text>;
// @ts-expect-error Foreground reset tokens do not apply to backgrounds.
const textBackgroundReset = <Text backgroundColor="revert">text</Text>;

// Screen-reader-only component props are not part of the current visual Runtime vocabulary.
// @ts-expect-error Box does not accept an ARIA label prop.
const boxAriaLabel = <Box ariaLabel="status" />;
// @ts-expect-error Box does not accept an ARIA hidden prop.
const boxAriaHidden = <Box ariaHidden />;
// @ts-expect-error Box does not accept an ARIA role prop.
const boxAriaRole = <Box ariaRole="status" />;
// @ts-expect-error Box does not accept an ARIA state prop.
const boxAriaState = <Box ariaState={{ busy: true }} />;
// @ts-expect-error Text does not accept an ARIA label prop.
const textAriaLabel = <Text ariaLabel="value">text</Text>;
// @ts-expect-error Text does not accept an ARIA hidden prop.
const textAriaHidden = <Text ariaHidden>text</Text>;

void boxFlexWrap;
void boxAlignSelf;
void boxPaddingX;
void boxMarginLeft;
void boxOverflowX;
void boxBorderTop;
void boxBorderPreset;
void boxReverseDirection;
void boxPercentageHeight;
void textItalic;
void textUnderline;
void textStrikethrough;
void textInverse;
void textTruncateEnd;
void textBackgroundReset;
void boxAriaLabel;
void boxAriaHidden;
void boxAriaRole;
void boxAriaState;
void textAriaLabel;
void textAriaHidden;

// Common visual components are passive; targeted pointer behavior is outside
// the current Runtime foundation.
// @ts-expect-error Box rejects the removed mouse listener.
const boxMousedown = <Box onMousedown={() => {}} />;
// @ts-expect-error Box rejects the React-style casing too.
const boxMouseDown = <Box onMouseDown={() => {}} />;
// @ts-expect-error Box rejects the removed mouse listener.
const boxMouseup = <Box onMouseup={() => {}} />;
// @ts-expect-error Box rejects the removed mouse listener.
const boxClick = <Box onClick={() => {}} />;
// @ts-expect-error Box rejects the removed mouse listener.
const boxWheel = <Box onWheel={() => {}} />;

// @ts-expect-error Text rejects the removed mouse listener.
const textMousedown = <Text onMousedown={() => {}}>text</Text>;
// @ts-expect-error Text rejects the React-style casing too.
const textMouseDown = <Text onMouseDown={() => {}}>text</Text>;
// @ts-expect-error Text rejects the removed mouse listener.
const textMouseup = <Text onMouseup={() => {}}>text</Text>;
// @ts-expect-error Text rejects the removed mouse listener.
const textClick = <Text onClick={() => {}}>text</Text>;
// @ts-expect-error Text rejects the removed mouse listener.
const textWheel = <Text onWheel={() => {}}>text</Text>;

void boxMousedown;
void boxMouseDown;
void boxMouseup;
void boxClick;
void boxWheel;
void textMousedown;
void textMouseDown;
void textMouseup;
void textClick;
void textWheel;
