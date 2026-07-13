import { shallowRef } from "vue";
import { ScrollBox, Spinner, type ScrollBoxExpose, type ScrollBoxProps } from "./index.ts";

const scrollBox = shallowRef<ScrollBoxExpose | null>(null);
const supported = <ScrollBox ref={scrollBox}>content</ScrollBox>;
const leaf = <Spinner type="line" />;

// The recognizable names are present only as rejected optional-never props.
const rejectedProps: ScrollBoxProps = {};
// @ts-expect-error Mouse behavior is registered with @vue-tui/runtime/fullscreen composables.
rejectedProps.onMousedown = () => {};
// @ts-expect-error Mouse behavior is registered with @vue-tui/runtime/fullscreen composables.
rejectedProps.onMouseup = () => {};
// @ts-expect-error Mouse behavior is registered with @vue-tui/runtime/fullscreen composables.
rejectedProps.onClick = () => {};
// @ts-expect-error Mouse behavior is registered with @vue-tui/runtime/fullscreen composables.
rejectedProps.onWheel = () => {};
// @ts-expect-error ScrollBox is passive; listeners cannot fall through to its viewport Box.
const rejectedScrollBoxListener = <ScrollBox onClick={() => {}}>content</ScrollBox>;

scrollBox.value?.scrollByLines(1);
scrollBox.value?.scrollToLine(2);
scrollBox.value?.scrollToTop();
scrollBox.value?.scrollToBottom();

// @ts-expect-error Spinner is a leaf component and ignores child content.
const unsupportedSpinnerChildren = <Spinner children="ignored" />;

void supported;
void leaf;
void unsupportedSpinnerChildren;
void rejectedScrollBoxListener;
