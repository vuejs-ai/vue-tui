import { Box, Text } from "@vue-tui/runtime";

const completeBox = (
  <Box
    flexDirection="column-reverse"
    flexWrap="wrap-reverse"
    flexGrow={1.5}
    flexShrink={0}
    flexBasis="25%"
    alignItems="center"
    alignSelf="auto"
    justifyContent="space-evenly"
    gap={1}
    rowGap={2}
    columnGap={3}
    width="55.9%"
    height={4}
    minWidth={1}
    minHeight={0}
    maxWidth={80}
    maxHeight={20}
    position="absolute"
    top={-1}
    right="-5%"
    bottom={2}
    left={2}
    margin={1}
    marginX={2}
    marginY={3}
    marginTop={-2}
    marginRight={4}
    marginBottom={5}
    marginLeft={6}
    padding={1}
    paddingX={2}
    paddingY={3}
    paddingTop={1}
    paddingBottom={1}
    paddingLeft={2}
    paddingRight={2}
    borderStyle="round"
    borderTop
    borderRight={false}
    borderBottom
    borderLeft={false}
    borderColor="gray"
    backgroundColor="#12abEF"
    overflow="hidden"
    overflowX="visible"
    overflowY="hidden"
  >
    <Text
      color="default"
      backgroundColor="default"
      dimColor
      bold
      italic
      underline
      strikethrough
      inverse
      wrap="hard"
    >
      text
    </Text>
  </Box>
);

void completeBox;

const textWrapModes = [
  <Text wrap="wrap">wrap</Text>,
  <Text wrap="hard">hard</Text>,
  <Text wrap="truncate">truncate</Text>,
  <Text wrap="truncate-middle">middle</Text>,
  <Text wrap="truncate-start">start</Text>,
];

const textModifierStates = [
  <Text
    dimColor={false}
    bold={false}
    italic={false}
    underline={false}
    strikethrough={false}
    inverse={false}
  >
    explicit false
  </Text>,
  <Text
    dimColor={undefined}
    bold={undefined}
    italic={undefined}
    underline={undefined}
    strikethrough={undefined}
    inverse={undefined}
  >
    omitted state
  </Text>,
];

void textWrapModes;
void textModifierStates;

// Removed layout and paint vocabulary does not survive on the public constructor.
// @ts-expect-error Vue visibility directives replace the removed public display prop.
const boxDisplay = <Box display="none" />;
// @ts-expect-error Multi-line cross-axis distribution is outside the public Box surface.
const boxAlignContent = <Box alignContent="center" />;
// @ts-expect-error Aspect-ratio policy is outside the public Box surface.
const boxAspectRatio = <Box aspectRatio={2} />;
// @ts-expect-error Only evidenced border presets remain public.
const boxBorderPreset = <Box borderStyle="double" />;
// @ts-expect-error Height has no percentage baseline on every host.
const boxPercentageHeight = <Box height="100%" />;

// @ts-expect-error The duplicate end-truncation spelling was removed.
const textTruncateEnd = <Text wrap="truncate-end">text</Text>;
// @ts-expect-error Legacy foreground reset aliases were replaced by `default`.
const textForegroundRevert = <Text color="revert">text</Text>;
// @ts-expect-error Legacy foreground reset aliases were replaced by `default`.
const textForegroundInitial = <Text color="initial">text</Text>;
// @ts-expect-error Legacy reset aliases do not apply to the background channel.
const textBackgroundRevert = <Text backgroundColor="revert">text</Text>;
// @ts-expect-error Legacy reset aliases do not apply to the background channel.
const textBackgroundInitial = <Text backgroundColor="initial">text</Text>;

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

void boxDisplay;
void boxAlignContent;
void boxAspectRatio;
void boxBorderPreset;
void boxPercentageHeight;
void textTruncateEnd;
void textForegroundRevert;
void textForegroundInitial;
void textBackgroundRevert;
void textBackgroundInitial;
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
