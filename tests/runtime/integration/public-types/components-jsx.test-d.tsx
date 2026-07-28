import { Box, Text } from "@vue-tui/runtime";
import { Static } from "@vue-tui/runtime/inline";

const completeBox = (
  <Box
    flexDirection="column-reverse"
    flexWrap="wrap-reverse"
    flexGrow={1.5}
    flexShrink={0}
    flexBasis="25%"
    alignItems="center"
    alignSelf="auto"
    alignContent="space-around"
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
    aspectRatio={2}
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
    borderStyle={{
      topLeft: "A",
      top: "B",
      topRight: "C",
      right: "D",
      bottomRight: "E",
      bottom: "F",
      bottomLeft: "G",
      left: "H",
    }}
    borderTop
    borderRight={false}
    borderBottom
    borderLeft={false}
    borderColor="gray"
    borderTopColor="green"
    borderLeftBackgroundColor="blue"
    borderDimColor
    borderBottomDimColor={false}
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

const textWrapModes = [
  <Text wrap="wrap">wrap</Text>,
  <Text wrap="hard">hard</Text>,
  <Text wrap="truncate">truncate</Text>,
  <Text wrap="truncate-middle">middle</Text>,
  <Text wrap="truncate-start">start</Text>,
];

const staticContent = (
  <Static>
    <Text>history</Text>
  </Static>
);

// @ts-expect-error Height has no percentage baseline on every host.
const percentageHeight = <Box height="100%" />;
// @ts-expect-error The supported end-truncation spelling is `truncate`.
const invalidWrap = <Text wrap="truncate-end">text</Text>;

void completeBox;
void textWrapModes;
void staticContent;
void percentageHeight;
void invalidWrap;
