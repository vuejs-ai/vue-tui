import { shallowRef } from "vue";
import { ScrollBox, Spinner, type ScrollBoxExpose } from "./index.ts";

const scrollBox = shallowRef<ScrollBoxExpose | null>(null);
const supported = <ScrollBox ref={scrollBox}>content</ScrollBox>;
const leaf = <Spinner type="line" />;

scrollBox.value?.scrollByLines(1);
scrollBox.value?.scrollToLine(2);
scrollBox.value?.scrollToTop();
scrollBox.value?.scrollToBottom();

// @ts-expect-error Spinner is a leaf component and ignores child content.
const unsupportedSpinnerChildren = <Spinner children="ignored" />;

void supported;
void leaf;
void unsupportedSpinnerChildren;
