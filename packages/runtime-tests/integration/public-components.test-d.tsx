import { Box, Text } from "@vue-tui/runtime";

// Common visual components are passive. Fullscreen mouse behavior is attached
// to a component ref with @vue-tui/runtime/fullscreen composables.
// @ts-expect-error Box rejects the removed mouse listener.
const boxMousedown = <Box onMousedown={() => {}} />;
// @ts-expect-error Box rejects the removed mouse listener.
const boxMouseup = <Box onMouseup={() => {}} />;
// @ts-expect-error Box rejects the removed mouse listener.
const boxClick = <Box onClick={() => {}} />;
// @ts-expect-error Box rejects the removed mouse listener.
const boxWheel = <Box onWheel={() => {}} />;

// @ts-expect-error Text rejects the removed mouse listener.
const textMousedown = <Text onMousedown={() => {}}>text</Text>;
// @ts-expect-error Text rejects the removed mouse listener.
const textMouseup = <Text onMouseup={() => {}}>text</Text>;
// @ts-expect-error Text rejects the removed mouse listener.
const textClick = <Text onClick={() => {}}>text</Text>;
// @ts-expect-error Text rejects the removed mouse listener.
const textWheel = <Text onWheel={() => {}}>text</Text>;

void boxMousedown;
void boxMouseup;
void boxClick;
void boxWheel;
void textMousedown;
void textMouseup;
void textClick;
void textWheel;
