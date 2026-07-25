import { shallowRef } from "vue";
import { ScrollBox, Spinner, type ScrollBoxExpose, type ScrollBoxProps } from "./index.ts";

const scrollBox = shallowRef<ScrollBoxExpose | null>(null);
const supported = <ScrollBox ref={scrollBox}>content</ScrollBox>;
const leaf = <Spinner type="line" />;

// The recognizable names are present only as rejected optional-never props.
const rejectedProps: ScrollBoxProps = {};
// @ts-expect-error Targeted pointer behavior is outside the current Runtime foundation.
rejectedProps.onMousedown = () => {};
// @ts-expect-error Targeted pointer behavior is outside the current Runtime foundation.
rejectedProps.onMouseup = () => {};
// @ts-expect-error Targeted pointer behavior is outside the current Runtime foundation.
rejectedProps.onClick = () => {};
// @ts-expect-error Targeted pointer behavior is outside the current Runtime foundation.
rejectedProps.onWheel = () => {};
// @ts-expect-error ScrollBox is passive; listeners cannot fall through to its viewport Box.
const rejectedScrollBoxListener = <ScrollBox onClick={() => {}}>content</ScrollBox>;

declare const exposed: ScrollBoxExpose;
declare const componentExposed: InstanceType<typeof ScrollBox>;
const relativeMovement: boolean = exposed.scrollByLines(1);
const absoluteMovement: boolean = exposed.scrollToLine(2);
const topMovement: boolean = componentExposed.scrollToTop();
const bottomMovement: boolean = componentExposed.scrollToBottom();
// @ts-expect-error The private sticky-following control is not a public argument.
exposed.scrollToLine(2, true);

// @ts-expect-error Spinner is a leaf component and ignores child content.
const unsupportedSpinnerChildren = <Spinner children="ignored" />;

void supported;
void leaf;
void unsupportedSpinnerChildren;
void rejectedScrollBoxListener;
void relativeMovement;
void absoluteMovement;
void topMovement;
void bottomMovement;
