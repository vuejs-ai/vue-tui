import { shallowRef, type VNodeRef } from "vue";
import { Box, Text, type TuiInputEvent } from "@vue-tui/runtime";
import { UseInputWhileMounted, type UseInputWhileMountedProps } from "../src/components.ts";
import { useInputWhileMounted, type InputWhileMountedTargetRef } from "../src/index.ts";

type KeyInputEvent = Extract<TuiInputEvent, { readonly type: "key" }>;
type TextInputEvent = Extract<TuiInputEvent, { readonly type: "text" }>;
type PasteInputEvent = Extract<TuiInputEvent, { readonly type: "paste" }>;

const targetRef = useInputWhileMounted((event) => {
  if (event.type === "key") event.key.name?.toUpperCase();
});
const acceptedFunctionRef: InputWhileMountedTargetRef = targetRef;
const acceptedVueRef: VNodeRef = targetRef;
const bound = (
  <Box ref={targetRef}>
    <Text>bound</Text>
  </Box>
);

const liveHandler = shallowRef<(event: TuiInputEvent) => void>(() => undefined);
const liveInputRef = useInputWhileMounted(liveHandler);
const filteredKeyRef = useInputWhileMounted(
  (event) => {
    const accepted: KeyInputEvent = event;
    event.key.name?.toUpperCase();
    // @ts-expect-error A key event has no text value.
    event.text.toUpperCase();
    void accepted;
  },
  { type: "key" },
);
const liveTextHandler = shallowRef<(event: TextInputEvent) => void>(() => undefined);
const filteredTextRef = useInputWhileMounted(liveTextHandler, { type: "text" });
const filteredPasteRef = useInputWhileMounted(
  (event) => {
    const accepted: PasteInputEvent = event;
    event.text.toUpperCase();
    // @ts-expect-error A paste event has no key value.
    event.key.name?.toUpperCase();
    void accepted;
  },
  { type: "paste" },
);
const component = (
  <UseInputWhileMounted
    onInput={(event) => {
      if (event.type === "text") event.text.toUpperCase();
    }}
  >
    <Text>component</Text>
  </UseInputWhileMounted>
);
const keyComponent = (
  <UseInputWhileMounted
    type="key"
    onInput={(event) => {
      const accepted: KeyInputEvent = event;
      event.key.name?.toUpperCase();
      // @ts-expect-error A key event has no text value.
      event.text.toUpperCase();
      void accepted;
    }}
  />
);
const textComponent = (
  <UseInputWhileMounted
    type="text"
    onInput={(event) => {
      const accepted: TextInputEvent = event;
      event.text.toUpperCase();
      void accepted;
    }}
  />
);
const keyProps: UseInputWhileMountedProps<"key"> = {
  type: "key",
  onInput: (event) => event.key.name?.toUpperCase(),
};

// @ts-expect-error The handler receives a normalized TuiInputEvent.
useInputWhileMounted((_event: string) => undefined);
// @ts-expect-error The selector must be a public input event type.
useInputWhileMounted(() => undefined, { type: "mouse" });
// @ts-expect-error A text handler cannot subscribe to key events.
useInputWhileMounted((_event: TextInputEvent) => undefined, { type: "key" });
// @ts-expect-error The component emits a normalized TuiInputEvent.
const wrongListener = <UseInputWhileMounted onInput={(_event: string) => undefined} />;
// @ts-expect-error The component selector must be a public input event type.
const wrongType = <UseInputWhileMounted type="mouse" />;
// @ts-expect-error The renderless component has no active prop; mount controls activity.
const wrongProp = <UseInputWhileMounted active />;

void acceptedFunctionRef;
void acceptedVueRef;
void bound;
void liveInputRef;
void filteredKeyRef;
void filteredTextRef;
void filteredPasteRef;
void component;
void keyComponent;
void textComponent;
void keyProps;
void wrongListener;
void wrongType;
void wrongProp;
